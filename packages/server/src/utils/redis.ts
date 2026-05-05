const createMockRedis = () => {
  const store = new Map<string, string>();
  return {
    get: async (key: string) => store.get(key) || null,
    set: async (key: string, value: string, ...args: any[]) => {
      store.set(key, value);
      return 'OK';
    },
    del: async (key: string) => {
      store.delete(key);
      return 1;
    },
    on: (event: string, cb: any) => {},
    once: () => {},
    quit: async () => 'OK',
  } as any;
};

export const redis = createMockRedis();
