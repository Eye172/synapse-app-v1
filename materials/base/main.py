import machine
import time
import json
import math

print("Инициализация UART...")
esp_uart = machine.UART(0, baudrate=115200, tx=machine.Pin(0), rx=machine.Pin(1), timeout=1000)

#Тут общение между кодом и контроллером
def send_at_cmd(cmd, timeout=0.5):
    if esp_uart.any(): esp_uart.read()
    esp_uart.write(bytes(cmd + "\r\n", "utf-8"))
    time.sleep(timeout)
    if esp_uart.any():
        try:
            res = esp_uart.read().decode('utf-8')
            print(f"CMD: {cmd} -> RESP: {res.strip()}")
            return res
        except: return ""
    return ""

print("Настройка Wi-Fi...")
send_at_cmd("AT+RST", timeout=2.5)
send_at_cmd("AT+CWMODE=1", timeout=0.5)

# На своём телефоне устанавливаем хотспот с названием Synapse и паролем GymSafetyNetPassword, чтобы чип нас нашёл.
send_at_cmd('AT+CWJAP="Synapse","GymSafetyNetPassword"', timeout=5.0)

send_at_cmd("AT+CIPMUX=1", timeout=0.5)

# Android телефоны в режиме хотспота всегда имеют IP 192.168.43.1
send_at_cmd('AT+CIPSTART=0,"UDP","192.168.43.1",1234,1234,2', timeout=0.5)
print("Wi-Fi подключен к хотспоту!")

#Тут подключается главный сенсор. Очень важно, чтобы пины сенсора были подключены к нужным пинам на контроллере.
print("Инициализация шины I2C и датчика...")
#SCL отвечает за время, подключён к GP9. SDA отвечает за память, подключён к GP8.
i2c = machine.I2C(0, scl=machine.Pin(9), sda=machine.Pin(8), freq=100000)
#INT отвечает за готовность передачи данных. Подключён к GP4.
bno_int = machine.Pin(4, machine.Pin.IN, machine.Pin.PULL_UP)
#RST отвечает за аварийное отключение. Подключён к GP5.
bno_rst = machine.Pin(5, machine.Pin.OUT)
#Адрес шины.
I2C_ADDR = 0x4b

#Тут на всякий случай даём нормально проснуться.
bno_rst.value(0)
time.sleep_ms(50)
bno_rst.value(1)
time.sleep_ms(200)

#Точно также мы пробуждаем все возможно уснувшие адреса.
try:
    wake = bytearray([0x15, 0x00, 0x02, 0x00, 0xFD, 0x05, 0x00, 0x00, 0x00, 0x20, 0x4E, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00])
    i2c.writeto(I2C_ADDR, wake)
    time.sleep(0.3)
except:
    pass

#Парсим пакеты, полученные от сенсора. Дальше писать не буду, потому что долго объяснять. Трогать ничего не нужно.
def get_sensor_data():
    try:
        data = i2c.readfrom(I2C_ADDR, 36)
        if len(data) < 20: return None
        
        if data[2] != 2 and data[2] != 3: return None
        
        for i in range(4, len(data) - 9):
            if data[i] == 0x05 or data[i] == 0xFB:
                base = i + 5
                if base + 8 <= len(data):
                    raw_i = (data[base+1] << 8) | data[base]
                    raw_j = (data[base+3] << 8) | data[base+2]
                    raw_k = (data[base+5] << 8) | data[base+4]
                    raw_r = (data[base+7] << 8) | data[base+6]
                    
                    def to_16(val):
                        return val - 65536 if val > 32767 else val

                    qi = to_16(raw_i) / 16384.0
                    qj = to_16(raw_j) / 16384.0
                    qk = to_16(raw_k) / 16384.0
                    qr = to_16(raw_r) / 16384.0
                    
                    if qi == 0.0 and qj == 0.0 and qk == 0.0 and qr == 1.0:
                        continue
                        
                    pitch = math.atan2(2.0 * (qr * qi + qj * qk), 1.0 - 2.0 * (qi * qi + qj * qj)) * (180.0 / math.pi)
                    return pitch
        return None
    except Exception as e:
        print("Ошибка шины I2C:", e)
        return None

print("Bluetooth система готова!")

#Чем меньше значение, тем сильнее будут сглаживаться значения углов. Не значит, что нужно сразу понижать.
SMOOTHING_ALPHA = 0.25

smoothed_angle = 0.0
first_run = True

while True:
    try:
        #50 миллисекунд на подготовку. Если не подготовился, заставляем.
        timeout = 50
        while bno_int.value() == 1 and timeout > 0:
            time.sleep_ms(1)
            timeout -= 1

        angle = get_sensor_data()
        if angle is not None:
            angle = abs(angle)
            
            if first_run:
                #Сначала просто пробуем.
                smoothed_angle = angle
                first_run = False
            else:
                smoothed_angle = (SMOOTHING_ALPHA * angle) + ((1.0 - SMOOTHING_ALPHA) * smoothed_angle)
                
            #Убираем мусор.
            if smoothed_angle < 1.0:
                smoothed_angle = 0.0
                
            display_angle = round(smoothed_angle, 1) if (round(smoothed_angle, 1) < 90) else (180 - round(smoothed_angle, 1))
            
            #Пока что мы просто проверяем если наклон сенсора меньше 45 градусов.
            mistake = display_angle < 45.0
            
            #Это то, что сенсор будет отправлять по WiFi на устройство.
            stats = json.dumps({
                "angle": display_angle,
                "alert": mistake
            })
            
            #Пишем всё так, чтобы было понятно коду.
            esp_uart.write(bytes(f'AT+CIPSEND=0,{len(stats)}\r\n', 'utf-8'))
            time.sleep_ms(20)
            esp_uart.write(bytes(stats, 'utf-8'))

            print(f"Выполнение {"верное" if mistake == False else "неверное"}. Угол наклона: {display_angle} градусов")
    except Exception as e:
        print("Ошибка цикла:", e)
        
    #Это тоже нужно.
    time.sleep_ms(100)