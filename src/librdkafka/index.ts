import debug from "debug";

export type Logger = {
    debug: debug.IDebugger,
    info: debug.IDebugger,
    warn: debug.IDebugger,
    error: debug.IDebugger,
};
