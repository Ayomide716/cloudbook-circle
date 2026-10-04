import { createContext, useContext } from "react";

export interface CallPeer {
  id: string;
  name: string;
  avatar?: string | null;
}

export interface CallGroup {
  id: string;
  name: string;
}

export interface CallsApi {
  /** Ring someone for a one-to-one voice or video call. */
  startCall: (peer: CallPeer, isVoiceOnly: boolean) => void;
  /** Start a group call and alert the other members, wherever they are in the app. */
  startGroupCall: (group: CallGroup, isVoiceOnly: boolean, memberIds: string[]) => void;
  /** Join a group call that is already running. */
  joinGroupCall: (group: CallGroup, isVoiceOnly: boolean) => void;
  /** The group whose call you're in, if any. */
  activeGroupId: string | null;
  inCall: boolean;
}

export const CallsContext = createContext<CallsApi | null>(null);

/** Calls are app-wide so they ring on every page and keep going while you move around. */
export const useCalls = () => {
  const api = useContext(CallsContext);
  if (!api) throw new Error("useCalls must be used inside <CallProvider>");
  return api;
};
