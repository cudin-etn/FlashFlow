import { useRef, useState, useCallback, useEffect } from "react";

const MAX_LOG_ENTRIES = 500;

export function useFlashLogs() {
    const logsRef = useRef<string[]>([]);
    const [visibleLogs, setVisibleLogs] = useState<string[]>([]);
    const rafRef = useRef<number | null>(null);

    const appendLog = useCallback((entry: string) => {
        logsRef.current.push(entry);
        if (logsRef.current.length > MAX_LOG_ENTRIES) {
            logsRef.current = logsRef.current.slice(-MAX_LOG_ENTRIES);
        }
        if (rafRef.current === null) {
            rafRef.current = requestAnimationFrame(() => {
                setVisibleLogs([...logsRef.current]);
                rafRef.current = null;
            });
        }
    }, []);

    useEffect(() => {
        return () => {
            if (rafRef.current !== null) {
                cancelAnimationFrame(rafRef.current);
            }
        };
    }, []);

    return { visibleLogs, appendLog, logsRef };
}
