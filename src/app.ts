import { KeybaseBridge } from "./keybasebridge";

export function main() {
    const bridge = new KeybaseBridge();
    bridge.start().catch((ex) => {
        console.warn("Bridge failed to run:", ex);
    });
}

main();