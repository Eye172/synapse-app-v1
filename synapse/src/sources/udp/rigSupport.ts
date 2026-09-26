import { Platform } from 'react-native';

/**
 * Can this build talk to a Rig at all?
 *
 * The Rig streams UDP to the phone's hotspot, and a browser has no UDP
 * socket. So the web build has no Rig — not a Rig that never connects:
 * every screen that offers to connect one, or reports its link, checks this
 * and leaves the Rig out. The web build trains the one way that needs no
 * hardware: the laptop's camera, MediaPipe, and the 3D body on the picture.
 */
export const RIG_SUPPORTED = Platform.OS !== 'web';
