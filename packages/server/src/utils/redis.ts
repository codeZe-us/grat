const createMockRedis = () => {
  const store = new Map<string, string>();
  return {
    get: async (key: string) => store.get(key) || null,
    set: async (key: string, value: string, ..._args: unknown[]) => {
      store.set(key, value);
      return 'OK';
    },
    del: async (key: string) => {
      store.delete(key);
      return 1;
    },
    on: (_event: string, _cb: unknown) => {},
    once: () => {},
    quit: async () => 'OK',
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
};

export const redis = createMockRedis();
