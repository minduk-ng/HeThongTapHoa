import { useState, useEffect } from 'react';

type ReverbStatus = 'connected' | 'connecting' | 'disconnected';

export function useReverbStatus() {
    const [status, setStatus] = useState<ReverbStatus>('connecting');

    useEffect(() => {
        if (typeof window === 'undefined' || !window.Echo) {
            queueMicrotask(() => setStatus('disconnected'));

            return;
        }

        const pusher = (window.Echo as any).connector?.pusher;

        if (!pusher) {
            queueMicrotask(() => setStatus('disconnected'));

            return;
        }

        const mapState = (pusherState: string): ReverbStatus => {
            switch (pusherState) {
                case 'connected':
                    return 'connected';
                case 'connecting':
                case 'unavailable':
                case 'initialized':
                    return 'connecting';
                default:
                    return 'disconnected';
            }
        };

        queueMicrotask(() => setStatus(mapState(pusher.connection?.state || 'connecting')));

        const handleStateChange = (states: { current: string }) => {
            setStatus(mapState(states.current));
        };

        pusher.connection.bind('state_change', handleStateChange);

        return () => {
            pusher.connection.unbind('state_change', handleStateChange);
        };
    }, []);

    return { status };
}
