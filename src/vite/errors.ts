class PluginError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public override readonly cause?: Error,
  ) {
    super(message);
    this.name = "PluginError";
  }
}

class NodeRedStartError extends PluginError {
  constructor(cause?: Error) {
    super("Failed to start Node-RED", "NODE_RED_START_FAILED", cause);
    this.name = "NodeRedStartError";
  }
}

class BuildError extends PluginError {
  constructor(phase: "server" | "client", cause?: Error) {
    super(
      `Failed to build ${phase}`,
      `BUILD_${phase.toUpperCase()}_FAILED`,
      cause,
    );
    this.name = "BuildError";
  }
}

class ConfigError extends PluginError {
  constructor(message: string) {
    super(message, "CONFIG_INVALID");
    this.name = "ConfigError";
  }
}

export { PluginError, NodeRedStartError, BuildError, ConfigError };
