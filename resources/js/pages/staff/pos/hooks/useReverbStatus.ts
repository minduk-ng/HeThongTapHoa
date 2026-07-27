import { useState, useEffect, useRef, useCallback } from 'react';

type ReverbStatus = 'connected' | 'connecting' | 'disconnected';

interface UseReverbStatusReturn {
    status: ReverbStatus;
    latencyMs: number | null;
}

export function useReverbStatus(): UseReverbStatusReturn {
    const [status, setStatus] = useState<ReverbStatus>('connecting');
    const [latencyMs, setLatencyMs] = useState<number | null>(null);
    const pingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const measureLatency = useCallback(() => {
        if (typeof window === 'undefined' || !window.Echo) return;

        try {
            const pusher = (window.Echo as any).connector?.pusher;
            if (!pusher || pusher.connection?.state !== 'connected') return;

            const start = performance.now();
            // Pusher internally handles pong responses; we use the send_event
            // on the connection socket to measure round-trip time
            const socket = pusher.connection?.socket;
            if (socket && typeof socket.send === 'function') {
                // Send a ping frame and measure when the pong comes back
                try {
                    socket.send(JSON.stringify({ event: 'pusher:ping', data: {} }));
                    // Listen for pong — Pusher fires 'pong' event on connection
                    const onPong = () => {
                        const rtt = Math.round(performance.now() - start);
                        setLatencyMs(rtt);
                        pusher.connection.unbind('pong', onPong);
                    };
                    pusher.connection.bind('pong', onPong);

                    // Safety timeout — if no pong in 5s, unbind
                    setTimeout(() => {
                        pusher.connection.unbind('pong', onPong);
                    }, 5000);
                } catch {
                    // Socket send failed — ignore silently
                }
            }
        } catch {
            // Pusher internal API access failed — ignore
        }
    }, []);

    useEffect(() => {
        if (typeof window === 'undefined' || !window.Echo) {
            setStatus('disconnected');
            return;
        }

        const pusher = (window.Echo as any).connector?.pusher;
        if (!pusher) {
            setStatus('disconnected');
            return;
        }

        // Map Pusher connection states to our simplified states
        const mapState = (pusherState: string): ReverbStatus => {
            switch (pusherState) {
                case 'connected':
                    return 'connected';
                case 'connecting':
                case 'unavailable':
                case 'initialized':
                    return 'connecting';
                case 'disconnected':
                case 'failed':
                default:
                    return 'disconnected';
            }
        };

        // Set initial state
        const initialState = pusher.connection?.state || 'connecting';
        setStatus(mapState(initialState));

        // Listen for state changes
        const handleStateChange = (states: { current: string; previous: string }) => {
            setStatus(mapState(states.current));

            // Reset latency when disconnected
            if (states.current !== 'connected') {
                setLatencyMs(null);
            }
        };

        pusher.connection.bind('state_change', handleStateChange);

        // Start periodic latency measurement every 15 seconds when connected
        pingIntervalRef.current = setInterval(() => {
            measureLatency();
        }, 15000);

        // Initial latency measurement after 2s delay (wait for connection)
        const initialPingTimeout = setTimeout(() => {
            measureLatency();
        }, 2000);

        return () => {
            pusher.connection.unbind('state_change', handleStateChange);
            if (pingIntervalRef.current) {
                clearInterval(pingIntervalRef.current);
            }
            clearTimeout(initialPingTimeout);
        };
    }, [measureLatency]);

    return { status, latencyMs };
}
