package expo.modules.rigudp

import android.os.Bundle
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.net.DatagramPacket
import java.net.DatagramSocket
import java.net.Inet4Address
import java.net.InetSocketAddress
import java.net.NetworkInterface
import java.net.SocketException

/**
 * The Rig's receiving end: one UDP socket, bound to one port, handing every
 * datagram to JS as text.
 *
 * This replaces react-native-udp, which was abandoned in 2021 and cannot be
 * built against AGP 8 or run under the New Architecture — and Reanimated 4
 * refuses to build without the New Architecture, so keeping it meant no APK
 * at all. Nothing here is general-purpose: the app only ever listens, so
 * there is no send path, no multicast, no second socket.
 */
class RigUdpModule : Module() {
  private var socket: DatagramSocket? = null
  private var reader: Thread? = null

  override fun definition() = ModuleDefinition {
    Name("RigUdp")

    Events(EVENT_MESSAGE, EVENT_ERROR)

    AsyncFunction("bind") { port: Int ->
      closeSocket()
      try {
        // reuseAddress so a restarted app can rebind immediately instead of
        // waiting out the previous socket — a tester will reopen the screen
        // far faster than the OS releases the port
        val s = DatagramSocket(null)
        s.reuseAddress = true
        s.bind(InetSocketAddress(port))
        socket = s
        startReading(s)
      } catch (e: Exception) {
        closeSocket()
        throw BindFailedException(port, e)
      }
    }

    AsyncFunction("close") {
      closeSocket()
    }

    /**
     * Every IPv4 address this phone currently holds, one per interface, as
     * "<interface> <address>".
     *
     * The platform's own "what is my IP" answer reports the *main* interface,
     * which on a phone that is both joined to Wi-Fi and hosting a hotspot is
     * the wrong one — it names the home network while the Rig is talking to
     * the hotspot. The firmware sends to a fixed address, so the only question
     * that matters is whether this phone actually holds it, and that cannot be
     * answered without seeing every interface.
     */
    Function("addresses") {
      val found = mutableListOf<String>()
      try {
        for (ni in NetworkInterface.getNetworkInterfaces()) {
          if (!ni.isUp) continue
          for (addr in ni.inetAddresses) {
            if (addr is Inet4Address && !addr.isLoopbackAddress) {
              found.add("${ni.name} ${addr.hostAddress}")
            }
          }
        }
      } catch (e: Exception) {
        // interface enumeration is a diagnostic, never a reason to fail
      }
      found
    }

    OnDestroy {
      closeSocket()
    }
  }

  private fun startReading(s: DatagramSocket) {
    val t = Thread {
      // one reusable buffer: the firmware's frames are a few hundred bytes and
      // anything larger than this is not ours
      val buffer = ByteArray(MAX_DATAGRAM)
      var consecutiveFailures = 0
      while (!s.isClosed) {
        try {
          val packet = DatagramPacket(buffer, buffer.size)
          s.receive(packet)
          consecutiveFailures = 0
          sendEvent(
            EVENT_MESSAGE,
            Bundle().apply {
              putString("data", String(packet.data, packet.offset, packet.length, Charsets.UTF_8))
              putString("address", packet.address?.hostAddress ?: "")
              putInt("port", packet.port)
            },
          )
        } catch (e: SocketException) {
          // close() unblocks receive() by closing the socket underneath it;
          // that is the normal shutdown path, not a failure worth reporting
          if (!s.isClosed) emitError(e.message ?: "socket closed unexpectedly")
          return@Thread
        } catch (e: Exception) {
          // a single malformed read should not kill the link, but a socket
          // that only throws would spin this loop hot
          consecutiveFailures += 1
          if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
            emitError(e.message ?: "receive failed repeatedly")
            return@Thread
          }
        }
      }
    }
    t.name = "synapse-rig-udp"
    t.isDaemon = true
    reader = t
    t.start()
  }

  private fun emitError(message: String) {
    sendEvent(EVENT_ERROR, Bundle().apply { putString("message", message) })
  }

  private fun closeSocket() {
    val s = socket
    socket = null
    // closing is what unblocks the reader's receive(); it then sees isClosed
    // and returns on its own
    s?.close()
    reader = null
  }

  companion object {
    private const val EVENT_MESSAGE = "onMessage"
    private const val EVENT_ERROR = "onError"
    private const val MAX_DATAGRAM = 4096
    private const val MAX_CONSECUTIVE_FAILURES = 16
  }
}

internal class BindFailedException(port: Int, cause: Throwable) :
  CodedException("ERR_RIG_UDP_BIND", "Could not listen on UDP port $port: ${cause.message}", cause)
