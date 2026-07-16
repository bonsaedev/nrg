import {
  IONode,
  Channels,
  type Input,
  type Outputs,
  type Port,
  type WithMessageChannels,
} from "@/sdk/lib/server";

// Reads a ROOT wire field AND an off-the-wire private channel, and echoes both.
// Used to prove that an `inputRoot` rebase preserves `_msgid` — the key the
// channel store is partitioned by — so a rebased message still resolves its
// channels.
type RawIn = { value?: unknown };
type ChannelEchoIn = RawIn & WithMessageChannels;
type ChannelEchoOutputs = Outputs<{
  out: Port<{ value: unknown; secret: unknown }>;
}>;

class ChannelEcho extends IONode<
  Record<string, never>,
  Record<string, never>,
  Input<Port<RawIn>>,
  ChannelEchoOutputs
> {
  static override readonly type = "message-model-channel-echo";

  override async input(msg: ChannelEchoIn) {
    this.send("out", {
      value: msg.value,
      secret: msg[Channels].private.secret,
    });
  }
}

export default ChannelEcho;
