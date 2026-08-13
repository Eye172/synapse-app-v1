/**
 * What the Rig's firmware has baked in.
 *
 * None of this is configurable from the app, and none of it is a suggestion.
 * These are literal constants in the Rig's own source
 * (`materials/base/main.py`), so the phone has to match them rather than the
 * other way round:
 *
 *   AT+CWJAP="Synapse","…"                    ← the network it looks for
 *   AT+CIPSTART=0,"UDP","192.168.43.1",1234   ← where it sends, unconditionally
 *
 * The firmware's comment claims Android hotspots are "always" 192.168.43.1.
 * They are not — plenty of phones hand out a different subnet, and on those
 * the Rig's packets have nowhere to go. The app cannot fix that from its end;
 * it can only say so plainly.
 */

/** The hotspot name the Rig joins. Exact, case-sensitive. */
export const RIG_HOTSPOT_SSID = 'Synapse';

/**
 * The hotspot password the Rig authenticates with. Not a choice.
 *
 * Confirmed twice on real hardware: by the rig's owner and, separately, by
 * the field tester, who reported that the sensors will not connect under any
 * other password. The prototype listing in `materials/base/main.py` still
 * says `GymSafetyNetPassword`; that listing is stale, not this constant.
 *
 * A wrong password looks exactly like a dead rig — it associates with
 * nothing and sends nothing — which is why the Connect screen shows this
 * value to copy rather than inviting anyone to pick a stronger one.
 */
export const RIG_HOTSPOT_PASSWORD = 'GymSafetyNetPass';

/** The single address the firmware sends to. The phone must hold it. */
export const RIG_TARGET_IP = '192.168.43.1';

/**
 * The address out of one `"<interface> <address>"` line from the native
 * module. Interface names never contain spaces, so the last field is the
 * address.
 */
export function addressOf(entry: string): string {
  // trim before splitting: a trailing space would otherwise be "the last
  // field" and every address would read as empty
  const line = entry.trim();
  const cut = line.lastIndexOf(' ');
  return cut < 0 ? line : line.slice(cut + 1);
}

/**
 * Can the Rig's packets land on this phone at all?
 *
 * Compared whole rather than by prefix: 192.168.43.10 is a different machine
 * from 192.168.43.1, and treating one as the other would report a working
 * link that silently receives nothing.
 */
export function holdsRigTarget(addresses: readonly string[]): boolean {
  return addresses.some((entry) => addressOf(entry) === RIG_TARGET_IP);
}
