export type CommandType = 'kitchen.complete' | 'kitchen.complete-items' | 'serving.mark-served';
export type CommandStatus = 'pending' | 'flushing' | 'failed';

export interface QueueCommand {
    id: string;
    type: CommandType;
    url: string;
    payload: Record<string, unknown>;
    status: CommandStatus;
    retryCount: number;
    error?: string;
    createdAt: number;
}

export const COMMAND_URLS: Partial<Record<CommandType, string>> = {
    'kitchen.complete-items': '/staff/kitchen/complete-items',
    'serving.mark-served': '/staff/serving/mark-served',
};

const KEY = 'taphoa.commandQueue';
export const MAX_AUTO_RETRIES = 5;

export type SendResult = { ok: boolean; status: number; body: any };
export type SendFn = (cmd: QueueCommand) => Promise<SendResult>;

type QueueListener = (queue: QueueCommand[]) => void;

export function readQueue(storage: Pick<Storage, 'getItem'>): QueueCommand[] {
    try {
        const raw = storage.getItem(KEY);
        const parsed = raw ? JSON.parse(raw) : [];

        return (Array.isArray(parsed) ? parsed : []).map((c: QueueCommand) =>
            c.status === 'flushing' ? { ...c, status: 'pending' as CommandStatus } : c,
        ).filter((c: QueueCommand) => c && c.id && c.url);
    } catch {
        return [];
    }
}

export function writeQueue(storage: Pick<Storage, 'setItem' | 'removeItem'>, cmds: QueueCommand[]): void {
    if (cmds.length === 0) {
        storage.removeItem(KEY);

        return;
    }

    storage.setItem(KEY, JSON.stringify(cmds));
}

function update(storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>, id: string, patch: Partial<QueueCommand>): QueueCommand[] {
    const next = readQueue(storage).map((c) => (c.id === id ? { ...c, ...patch } : c));
    writeQueue(storage, next);

    return next;
}

export function removeCommand(storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>, id: string): QueueCommand[] {
    const next = readQueue(storage).filter((c) => c.id !== id);
    writeQueue(storage, next);

    return next;
}

export function enqueue(
    storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>,
    cmd: Omit<QueueCommand, 'id' | 'status' | 'retryCount' | 'createdAt'>,
): QueueCommand {
    const command: QueueCommand = {
        ...cmd,
        id: crypto.randomUUID(),
        status: 'pending',
        retryCount: 0,
        createdAt: Date.now(),
    };
    writeQueue(storage, [...readQueue(storage), command]);

    return command;
}

export function markFailed(
    storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>,
    id: string,
    error: string,
): QueueCommand[] {
    return update(storage, id, { status: 'failed', error });
}

export function retryFailed(storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>, id: string): QueueCommand[] {
    return update(storage, id, { status: 'pending', retryCount: 0, error: undefined });
}

export function discardCommand(storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>, id: string): QueueCommand[] {
    return removeCommand(storage, id);
}

export async function flush(
    storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>,
    send: SendFn,
    onChange: QueueListener,
): Promise<void> {
    let queue = readQueue(storage);

    while (queue.length > 0) {
        const cmd = queue.find((c) => c.status === 'pending' || c.status === 'flushing');
        const next = cmd ?? queue.find((c) => c.status === 'failed');

        if (!next || next.status === 'failed') {
            break;
        }

        update(storage, next.id, { status: 'flushing' });
        onChange(readQueue(storage));

        let res: SendResult | null = null;

        try {
            res = await send({ ...next, payload: { ...next.payload, idempotency_key: next.payload.idempotency_key ?? next.id } });
        } catch {
            res = null;
        }

        if (res === null) {
            update(storage, next.id, { status: 'pending', retryCount: next.retryCount + 1 });
            onChange(readQueue(storage));

            if (next.retryCount + 1 >= MAX_AUTO_RETRIES) {
                markFailed(storage, next.id, 'Mất kết nối kéo dài. Vui lòng kiểm tra mạng và thử lại.');
                onChange(readQueue(storage));
                queue = readQueue(storage);
                continue;
            }

            break;
        }

        if (res.status >= 200 && res.status < 300 && res.body?.success !== false) {
            removeCommand(storage, next.id);
        } else if (res.status >= 500) {
            update(storage, next.id, { status: 'pending', retryCount: next.retryCount + 1 });
            onChange(readQueue(storage));

            if (next.retryCount + 1 >= MAX_AUTO_RETRIES) {
                markFailed(storage, next.id, 'Máy chủ đang lỗi liên tục. Vui lòng thử lại sau.');
                onChange(readQueue(storage));
                queue = readQueue(storage);
                continue;
            }

            break;
        } else {
            markFailed(storage, next.id, String(res.body?.error ?? res.body?.message ?? `Lỗi máy chủ (${res.status}).`));
        }

        queue = readQueue(storage);
        onChange(queue);
    }
}
