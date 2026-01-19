import type config from "./default";

export type DeepPartial<T> = T extends object
  ? {
    [P in keyof T]?: DeepPartial<T[P]>;
  }
  : T;

export type BaseConfigType = {
  mode: 'development' | 'production' | 'tunnel' | 'test' | 'staging',
  s3BucketPrefix?: string
}

export type BaseAuthStrategies = 'password' | 'passkey' | 'oauth' | 'totp'
export type BaseOAuthProviders = 'github' | 'google' | 'microsoft'

type ConfigType = DeepPartial<typeof config>

export type Config = Omit<ConfigType, keyof BaseConfigType> & BaseConfigType;