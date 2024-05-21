// @ts-nocheck

/**
 * Client
**/

import * as runtime from './runtime/index';
declare const prisma: unique symbol
export type PrismaPromise<A> = Promise<A> & {[prisma]: true}
type UnwrapPromise<P extends any> = P extends Promise<infer R> ? R : P
type UnwrapTuple<Tuple extends readonly unknown[]> = {
  [K in keyof Tuple]: K extends `${number}` ? Tuple[K] extends PrismaPromise<infer X> ? X : UnwrapPromise<Tuple[K]> : UnwrapPromise<Tuple[K]>
};


/**
 * Model Labels
 * 
 */
export type Labels = {
  id: string
  name: string
  color: string | null
  project_id: string
}

/**
 * Model Tasks
 * 
 */
export type Tasks = {
  id: string
  slug: string
  markdown: string | null
  summary: string
  type: string
  /**
   * @zod.number.int().gte(-2147483648).lte(2147483647)
   */
  impact: number | null
  /**
   * @zod.number.int().gte(-2147483648).lte(2147483647)
   */
  sort_order: number | null
  /**
   * @zod.number.int().gte(-2147483648).lte(2147483647)
   */
  status: number
  project_id: string
  created_at: Date
  created_by: string
  assigned_by: string | null
  assigned_at: Date | null
  modified_at: Date | null
  modified_by: string | null
}


/**
 * ##  Prisma Client ʲˢ
 * 
 * Type-safe database client for TypeScript & Node.js
 * @example
 * ```
 * const prisma = new PrismaClient()
 * // Fetch zero or more Labels
 * const labels = await prisma.labels.findMany()
 * ```
 *
 * 
 * Read more in our [docs](https://www.prisma.io/docs/reference/tools-and-interfaces/prisma-client).
 */
export class PrismaClient<
  T extends Prisma.PrismaClientOptions = Prisma.PrismaClientOptions,
  U = 'log' extends keyof T ? T['log'] extends Array<Prisma.LogLevel | Prisma.LogDefinition> ? Prisma.GetEvents<T['log']> : never : never,
  GlobalReject extends Prisma.RejectOnNotFound | Prisma.RejectPerOperation | false | undefined = 'rejectOnNotFound' extends keyof T
    ? T['rejectOnNotFound']
    : false
      > {
    /**
   * ##  Prisma Client ʲˢ
   * 
   * Type-safe database client for TypeScript & Node.js
   * @example
   * ```
   * const prisma = new PrismaClient()
   * // Fetch zero or more Labels
   * const labels = await prisma.labels.findMany()
   * ```
   *
   * 
   * Read more in our [docs](https://www.prisma.io/docs/reference/tools-and-interfaces/prisma-client).
   */

  constructor(optionsArg ?: Prisma.Subset<T, Prisma.PrismaClientOptions>);
  $on<V extends (U | 'beforeExit')>(eventType: V, callback: (event: V extends 'query' ? Prisma.QueryEvent : V extends 'beforeExit' ? () => Promise<void> : Prisma.LogEvent) => void): void;

  /**
   * Connect with the database
   */
  $connect(): Promise<void>;

  /**
   * Disconnect from the database
   */
  $disconnect(): Promise<void>;

  /**
   * Add a middleware
   */
  $use(cb: Prisma.Middleware): void

/**
   * Executes a prepared raw query and returns the number of affected rows.
   * @example
   * ```
   * const result = await prisma.$executeRaw`UPDATE User SET cool = ${true} WHERE email = ${'user@email.com'};`
   * ```
   * 
   * Read more in our [docs](https://www.prisma.io/docs/reference/tools-and-interfaces/prisma-client/raw-database-access).
   */
  $executeRaw<T = unknown>(query: TemplateStringsArray | Prisma.Sql, ...values: any[]): PrismaPromise<number>;

  /**
   * Executes a raw query and returns the number of affected rows.
   * Susceptible to SQL injections, see documentation.
   * @example
   * ```
   * const result = await prisma.$executeRawUnsafe('UPDATE User SET cool = $1 WHERE email = $2 ;', true, 'user@email.com')
   * ```
   * 
   * Read more in our [docs](https://www.prisma.io/docs/reference/tools-and-interfaces/prisma-client/raw-database-access).
   */
  $executeRawUnsafe<T = unknown>(query: string, ...values: any[]): PrismaPromise<number>;

  /**
   * Performs a prepared raw query and returns the `SELECT` data.
   * @example
   * ```
   * const result = await prisma.$queryRaw`SELECT * FROM User WHERE id = ${1} OR email = ${'user@email.com'};`
   * ```
   * 
   * Read more in our [docs](https://www.prisma.io/docs/reference/tools-and-interfaces/prisma-client/raw-database-access).
   */
  $queryRaw<T = unknown>(query: TemplateStringsArray | Prisma.Sql, ...values: any[]): PrismaPromise<T>;

  /**
   * Performs a raw query and returns the `SELECT` data.
   * Susceptible to SQL injections, see documentation.
   * @example
   * ```
   * const result = await prisma.$queryRawUnsafe('SELECT * FROM User WHERE id = $1 OR email = $2;', 1, 'user@email.com')
   * ```
   * 
   * Read more in our [docs](https://www.prisma.io/docs/reference/tools-and-interfaces/prisma-client/raw-database-access).
   */
  $queryRawUnsafe<T = unknown>(query: string, ...values: any[]): PrismaPromise<T>;

  /**
   * Allows the running of a sequence of read/write operations that are guaranteed to either succeed or fail as a whole.
   * @example
   * ```
   * const [george, bob, alice] = await prisma.$transaction([
   *   prisma.user.create({ data: { name: 'George' } }),
   *   prisma.user.create({ data: { name: 'Bob' } }),
   *   prisma.user.create({ data: { name: 'Alice' } }),
   * ])
   * ```
   * 
   * Read more in our [docs](https://www.prisma.io/docs/concepts/components/prisma-client/transactions).
   */
  $transaction<P extends PrismaPromise<any>[]>(arg: [...P], options?: { isolationLevel?: Prisma.TransactionIsolationLevel }): Promise<UnwrapTuple<P>>;

  $transaction<R>(fn: (prisma: Prisma.TransactionClient) => Promise<R>, options?: {maxWait?: number, timeout?: number, isolationLevel?: Prisma.TransactionIsolationLevel}): Promise<R>;

      /**
   * `prisma.labels`: Exposes CRUD operations for the **Labels** model.
    * Example usage:
    * ```ts
    * // Fetch zero or more Labels
    * const labels = await prisma.labels.findMany()
    * ```
    */
  get labels(): Prisma.LabelsDelegate<GlobalReject>;

  /**
   * `prisma.tasks`: Exposes CRUD operations for the **Tasks** model.
    * Example usage:
    * ```ts
    * // Fetch zero or more Tasks
    * const tasks = await prisma.tasks.findMany()
    * ```
    */
  get tasks(): Prisma.TasksDelegate<GlobalReject>;
}

export namespace Prisma {
  export import DMMF = runtime.DMMF

  /**
   * Prisma Errors
   */
  export import PrismaClientKnownRequestError = runtime.PrismaClientKnownRequestError
  export import PrismaClientUnknownRequestError = runtime.PrismaClientUnknownRequestError
  export import PrismaClientRustPanicError = runtime.PrismaClientRustPanicError
  export import PrismaClientInitializationError = runtime.PrismaClientInitializationError
  export import PrismaClientValidationError = runtime.PrismaClientValidationError
  export import NotFoundError = runtime.NotFoundError

  /**
   * Re-export of sql-template-tag
   */
  export import sql = runtime.sqltag
  export import empty = runtime.empty
  export import join = runtime.join
  export import raw = runtime.raw
  export import Sql = runtime.Sql

  /**
   * Decimal.js
   */
  export import Decimal = runtime.Decimal

  export type DecimalJsLike = runtime.DecimalJsLike

  /**
   * Metrics 
   */
  export type Metrics = runtime.Metrics
  export type Metric<T> = runtime.Metric<T>
  export type MetricHistogram = runtime.MetricHistogram
  export type MetricHistogramBucket = runtime.MetricHistogramBucket


  /**
   * Prisma Client JS version: 4.8.1
   * Query Engine version: e9771e62de70f79a5e1c604a2d7c8e2a0a874b48
   */
  export type PrismaVersion = {
    client: string
  }

  export const prismaVersion: PrismaVersion 

  /**
   * Utility Types
   */

  /**
   * From https://github.com/sindresorhus/type-fest/
   * Matches a JSON object.
   * This type can be useful to enforce some input to be JSON-compatible or as a super-type to be extended from. 
   */
  export type JsonObject = {[Key in string]?: JsonValue}

  /**
   * From https://github.com/sindresorhus/type-fest/
   * Matches a JSON array.
   */
  export interface JsonArray extends Array<JsonValue> {}

  /**
   * From https://github.com/sindresorhus/type-fest/
   * Matches any valid JSON value.
   */
  export type JsonValue = string | number | boolean | JsonObject | JsonArray | null

  /**
   * Matches a JSON object.
   * Unlike `JsonObject`, this type allows undefined and read-only properties.
   */
  export type InputJsonObject = {readonly [Key in string]?: InputJsonValue | null}

  /**
   * Matches a JSON array.
   * Unlike `JsonArray`, readonly arrays are assignable to this type.
   */
  export interface InputJsonArray extends ReadonlyArray<InputJsonValue | null> {}

  /**
   * Matches any valid value that can be used as an input for operations like
   * create and update as the value of a JSON field. Unlike `JsonValue`, this
   * type allows read-only arrays and read-only object properties and disallows
   * `null` at the top level.
   *
   * `null` cannot be used as the value of a JSON field because its meaning
   * would be ambiguous. Use `Prisma.JsonNull` to store the JSON null value or
   * `Prisma.DbNull` to clear the JSON value and set the field to the database
   * NULL value instead.
   *
   * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-by-null-values
   */
export type InputJsonValue = null | string | number | boolean | InputJsonObject | InputJsonArray

  /**
   * Types of the values used to represent different kinds of `null` values when working with JSON fields.
   * 
   * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
   */
  namespace NullTypes {
    /**
    * Type of `Prisma.DbNull`.
    * 
    * You cannot use other instances of this class. Please use the `Prisma.DbNull` value.
    * 
    * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
    */
    class DbNull {
      private DbNull: never
      private constructor()
    }

    /**
    * Type of `Prisma.JsonNull`.
    * 
    * You cannot use other instances of this class. Please use the `Prisma.JsonNull` value.
    * 
    * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
    */
    class JsonNull {
      private JsonNull: never
      private constructor()
    }

    /**
    * Type of `Prisma.AnyNull`.
    * 
    * You cannot use other instances of this class. Please use the `Prisma.AnyNull` value.
    * 
    * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
    */
    class AnyNull {
      private AnyNull: never
      private constructor()
    }
  }

  /**
   * Helper for filtering JSON entries that have `null` on the database (empty on the db)
   * 
   * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
   */
  export const DbNull: NullTypes.DbNull

  /**
   * Helper for filtering JSON entries that have JSON `null` values (not empty on the db)
   * 
   * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
   */
  export const JsonNull: NullTypes.JsonNull

  /**
   * Helper for filtering JSON entries that are `Prisma.DbNull` or `Prisma.JsonNull`
   * 
   * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
   */
  export const AnyNull: NullTypes.AnyNull

  type SelectAndInclude = {
    select: any
    include: any
  }
  type HasSelect = {
    select: any
  }
  type HasInclude = {
    include: any
  }
  type CheckSelect<T, S, U> = T extends SelectAndInclude
    ? 'Please either choose `select` or `include`'
    : T extends HasSelect
    ? U
    : T extends HasInclude
    ? U
    : S

  /**
   * Get the type of the value, that the Promise holds.
   */
  export type PromiseType<T extends PromiseLike<any>> = T extends PromiseLike<infer U> ? U : T;

  /**
   * Get the return type of a function which returns a Promise.
   */
  export type PromiseReturnType<T extends (...args: any) => Promise<any>> = PromiseType<ReturnType<T>>

  /**
   * From T, pick a set of properties whose keys are in the union K
   */
  type Prisma__Pick<T, K extends keyof T> = {
      [P in K]: T[P];
  };


  export type Enumerable<T> = T | Array<T>;

  export type RequiredKeys<T> = {
    [K in keyof T]-?: {} extends Prisma__Pick<T, K> ? never : K
  }[keyof T]

  export type TruthyKeys<T> = keyof {
    [K in keyof T as T[K] extends false | undefined | null ? never : K]: K
  }

  export type TrueKeys<T> = TruthyKeys<Prisma__Pick<T, RequiredKeys<T>>>

  /**
   * Subset
   * @desc From `T` pick properties that exist in `U`. Simple version of Intersection
   */
  export type Subset<T, U> = {
    [key in keyof T]: key extends keyof U ? T[key] : never;
  };

  /**
   * SelectSubset
   * @desc From `T` pick properties that exist in `U`. Simple version of Intersection.
   * Additionally, it validates, if both select and include are present. If the case, it errors.
   */
  export type SelectSubset<T, U> = {
    [key in keyof T]: key extends keyof U ? T[key] : never
  } &
    (T extends SelectAndInclude
      ? 'Please either choose `select` or `include`.'
      : {})

  /**
   * Subset + Intersection
   * @desc From `T` pick properties that exist in `U` and intersect `K`
   */
  export type SubsetIntersection<T, U, K> = {
    [key in keyof T]: key extends keyof U ? T[key] : never
  } &
    K

  type Without<T, U> = { [P in Exclude<keyof T, keyof U>]?: never };

  /**
   * XOR is needed to have a real mutually exclusive union type
   * https://stackoverflow.com/questions/42123407/does-typescript-support-mutually-exclusive-types
   */
  type XOR<T, U> =
    T extends object ?
    U extends object ?
      (Without<T, U> & U) | (Without<U, T> & T)
    : U : T


  /**
   * Is T a Record?
   */
  type IsObject<T extends any> = T extends Array<any>
  ? False
  : T extends Date
  ? False
  : T extends Uint8Array
  ? False
  : T extends BigInt
  ? False
  : T extends object
  ? True
  : False


  /**
   * If it's T[], return T
   */
  export type UnEnumerate<T extends unknown> = T extends Array<infer U> ? U : T

  /**
   * From ts-toolbelt
   */

  type __Either<O extends object, K extends Key> = Omit<O, K> &
    {
      // Merge all but K
      [P in K]: Prisma__Pick<O, P & keyof O> // With K possibilities
    }[K]

  type EitherStrict<O extends object, K extends Key> = Strict<__Either<O, K>>

  type EitherLoose<O extends object, K extends Key> = ComputeRaw<__Either<O, K>>

  type _Either<
    O extends object,
    K extends Key,
    strict extends Boolean
  > = {
    1: EitherStrict<O, K>
    0: EitherLoose<O, K>
  }[strict]

  type Either<
    O extends object,
    K extends Key,
    strict extends Boolean = 1
  > = O extends unknown ? _Either<O, K, strict> : never

  export type Union = any

  type PatchUndefined<O extends object, O1 extends object> = {
    [K in keyof O]: O[K] extends undefined ? At<O1, K> : O[K]
  } & {}

  /** Helper Types for "Merge" **/
  export type IntersectOf<U extends Union> = (
    U extends unknown ? (k: U) => void : never
  ) extends (k: infer I) => void
    ? I
    : never

  export type Overwrite<O extends object, O1 extends object> = {
      [K in keyof O]: K extends keyof O1 ? O1[K] : O[K];
  } & {};

  type _Merge<U extends object> = IntersectOf<Overwrite<U, {
      [K in keyof U]-?: At<U, K>;
  }>>;

  type Key = string | number | symbol;
  type AtBasic<O extends object, K extends Key> = K extends keyof O ? O[K] : never;
  type AtStrict<O extends object, K extends Key> = O[K & keyof O];
  type AtLoose<O extends object, K extends Key> = O extends unknown ? AtStrict<O, K> : never;
  export type At<O extends object, K extends Key, strict extends Boolean = 1> = {
      1: AtStrict<O, K>;
      0: AtLoose<O, K>;
  }[strict];

  export type ComputeRaw<A extends any> = A extends Function ? A : {
    [K in keyof A]: A[K];
  } & {};

  export type OptionalFlat<O> = {
    [K in keyof O]?: O[K];
  } & {};

  type _Record<K extends keyof any, T> = {
    [P in K]: T;
  };

  // cause typescript not to expand types and preserve names
  type NoExpand<T> = T extends unknown ? T : never;

  // this type assumes the passed object is entirely optional
  type AtLeast<O extends object, K extends string> = NoExpand<
    O extends unknown
    ? | (K extends keyof O ? { [P in K]: O[P] } & O : O)
      | {[P in keyof O as P extends K ? K : never]-?: O[P]} & O
    : never>;

  type _Strict<U, _U = U> = U extends unknown ? U & OptionalFlat<_Record<Exclude<Keys<_U>, keyof U>, never>> : never;

  export type Strict<U extends object> = ComputeRaw<_Strict<U>>;
  /** End Helper Types for "Merge" **/

  export type Merge<U extends object> = ComputeRaw<_Merge<Strict<U>>>;

  /**
  A [[Boolean]]
  */
  export type Boolean = True | False

  // /**
  // 1
  // */
  export type True = 1

  /**
  0
  */
  export type False = 0

  export type Not<B extends Boolean> = {
    0: 1
    1: 0
  }[B]

  export type Extends<A1 extends any, A2 extends any> = [A1] extends [never]
    ? 0 // anything `never` is false
    : A1 extends A2
    ? 1
    : 0

  export type Has<U extends Union, U1 extends Union> = Not<
    Extends<Exclude<U1, U>, U1>
  >

  export type Or<B1 extends Boolean, B2 extends Boolean> = {
    0: {
      0: 0
      1: 1
    }
    1: {
      0: 1
      1: 1
    }
  }[B1][B2]

  export type Keys<U extends Union> = U extends unknown ? keyof U : never

  type Exact<A, W = unknown> = 
  W extends unknown ? A extends Narrowable ? Cast<A, W> : Cast<
  {[K in keyof A]: K extends keyof W ? Exact<A[K], W[K]> : never},
  {[K in keyof W]: K extends keyof A ? Exact<A[K], W[K]> : W[K]}>
  : never;

  type Narrowable = string | number | boolean | bigint;

  type Cast<A, B> = A extends B ? A : B;

  export const type: unique symbol;

  export function validator<V>(): <S>(select: Exact<S, V>) => S;

  /**
   * Used by group by
   */

  export type GetScalarType<T, O> = O extends object ? {
    [P in keyof T]: P extends keyof O
      ? O[P]
      : never
  } : never

  type FieldPaths<
    T,
    U = Omit<T, '_avg' | '_sum' | '_count' | '_min' | '_max'>
  > = IsObject<T> extends True ? U : T

  type GetHavingFields<T> = {
    [K in keyof T]: Or<
      Or<Extends<'OR', K>, Extends<'AND', K>>,
      Extends<'NOT', K>
    > extends True
      ? // infer is only needed to not hit TS limit
        // based on the brilliant idea of Pierre-Antoine Mills
        // https://github.com/microsoft/TypeScript/issues/30188#issuecomment-478938437
        T[K] extends infer TK
        ? GetHavingFields<UnEnumerate<TK> extends object ? Merge<UnEnumerate<TK>> : never>
        : never
      : {} extends FieldPaths<T[K]>
      ? never
      : K
  }[keyof T]

  /**
   * Convert tuple to union
   */
  type _TupleToUnion<T> = T extends (infer E)[] ? E : never
  type TupleToUnion<K extends readonly any[]> = _TupleToUnion<K>
  type MaybeTupleToUnion<T> = T extends any[] ? TupleToUnion<T> : T

  /**
   * Like `Pick`, but with an array
   */
  type PickArray<T, K extends Array<keyof T>> = Prisma__Pick<T, TupleToUnion<K>>

  /**
   * Exclude all keys with underscores
   */
  type ExcludeUnderscoreKeys<T extends string> = T extends `_${string}` ? never : T


  export type FieldRef<Model, FieldType> = runtime.FieldRef<Model, FieldType>

  type FieldRefInputType<Model, FieldType> = Model extends never ? never : FieldRef<Model, FieldType>

  class PrismaClientFetcher {
    private readonly prisma;
    private readonly debug;
    private readonly hooks?;
    constructor(prisma: PrismaClient<any, any>, debug?: boolean, hooks?: Hooks | undefined);
    request<T>(document: any, dataPath?: string[], rootField?: string, typeName?: string, isList?: boolean, callsite?: string): Promise<T>;
    sanitizeMessage(message: string): string;
    protected unpack(document: any, data: any, path: string[], rootField?: string, isList?: boolean): any;
  }

  export const ModelName: {
    Labels: 'Labels',
    Tasks: 'Tasks'
  };

  export type ModelName = (typeof ModelName)[keyof typeof ModelName]


  export type Datasources = {
    db?: Datasource
  }

  export type DefaultPrismaClient = PrismaClient
  export type RejectOnNotFound = boolean | ((error: Error) => Error)
  export type RejectPerModel = { [P in ModelName]?: RejectOnNotFound }
  export type RejectPerOperation =  { [P in "findUnique" | "findFirst"]?: RejectPerModel | RejectOnNotFound } 
  type IsReject<T> = T extends true ? True : T extends (err: Error) => Error ? True : False
  export type HasReject<
    GlobalRejectSettings extends Prisma.PrismaClientOptions['rejectOnNotFound'],
    LocalRejectSettings,
    Action extends PrismaAction,
    Model extends ModelName
  > = LocalRejectSettings extends RejectOnNotFound
    ? IsReject<LocalRejectSettings>
    : GlobalRejectSettings extends RejectPerOperation
    ? Action extends keyof GlobalRejectSettings
      ? GlobalRejectSettings[Action] extends RejectOnNotFound
        ? IsReject<GlobalRejectSettings[Action]>
        : GlobalRejectSettings[Action] extends RejectPerModel
        ? Model extends keyof GlobalRejectSettings[Action]
          ? IsReject<GlobalRejectSettings[Action][Model]>
          : False
        : False
      : False
    : IsReject<GlobalRejectSettings>
  export type ErrorFormat = 'pretty' | 'colorless' | 'minimal'

  export interface PrismaClientOptions {
    /**
     * Configure findUnique/findFirst to throw an error if the query returns null. 
     * @deprecated since 4.0.0. Use `findUniqueOrThrow`/`findFirstOrThrow` methods instead.
     * @example
     * ```
     * // Reject on both findUnique/findFirst
     * rejectOnNotFound: true
     * // Reject only on findFirst with a custom error
     * rejectOnNotFound: { findFirst: (err) => new Error("Custom Error")}
     * // Reject on user.findUnique with a custom error
     * rejectOnNotFound: { findUnique: {User: (err) => new Error("User not found")}}
     * ```
     */
    rejectOnNotFound?: RejectOnNotFound | RejectPerOperation
    /**
     * Overwrites the datasource url from your schema.prisma file
     */
    datasources?: Datasources

    /**
     * @default "colorless"
     */
    errorFormat?: ErrorFormat

    /**
     * @example
     * ```
     * // Defaults to stdout
     * log: ['query', 'info', 'warn', 'error']
     * 
     * // Emit as events
     * log: [
     *  { emit: 'stdout', level: 'query' },
     *  { emit: 'stdout', level: 'info' },
     *  { emit: 'stdout', level: 'warn' }
     *  { emit: 'stdout', level: 'error' }
     * ]
     * ```
     * Read more in our [docs](https://www.prisma.io/docs/reference/tools-and-interfaces/prisma-client/logging#the-log-option).
     */
    log?: Array<LogLevel | LogDefinition>
  }

  export type Hooks = {
    beforeRequest?: (options: { query: string, path: string[], rootField?: string, typeName?: string, document: any }) => any
  }

  /* Types for Logging */
  export type LogLevel = 'info' | 'query' | 'warn' | 'error'
  export type LogDefinition = {
    level: LogLevel
    emit: 'stdout' | 'event'
  }

  export type GetLogType<T extends LogLevel | LogDefinition> = T extends LogDefinition ? T['emit'] extends 'event' ? T['level'] : never : never
  export type GetEvents<T extends any> = T extends Array<LogLevel | LogDefinition> ?
    GetLogType<T[0]> | GetLogType<T[1]> | GetLogType<T[2]> | GetLogType<T[3]>
    : never

  export type QueryEvent = {
    timestamp: Date
    query: string
    params: string
    duration: number
    target: string
  }

  export type LogEvent = {
    timestamp: Date
    message: string
    target: string
  }
  /* End Types for Logging */


  export type PrismaAction =
    | 'findUnique'
    | 'findMany'
    | 'findFirst'
    | 'create'
    | 'createMany'
    | 'update'
    | 'updateMany'
    | 'upsert'
    | 'delete'
    | 'deleteMany'
    | 'executeRaw'
    | 'queryRaw'
    | 'aggregate'
    | 'count'
    | 'runCommandRaw'
    | 'findRaw'

  /**
   * These options are being passed into the middleware as "params"
   */
  export type MiddlewareParams = {
    model?: ModelName
    action: PrismaAction
    args: any
    dataPath: string[]
    runInTransaction: boolean
  }

  /**
   * The `T` type makes sure, that the `return proceed` is not forgotten in the middleware implementation
   */
  export type Middleware<T = any> = (
    params: MiddlewareParams,
    next: (params: MiddlewareParams) => Promise<T>,
  ) => Promise<T>

  // tested in getLogLevel.test.ts
  export function getLogLevel(log: Array<LogLevel | LogDefinition>): LogLevel | undefined;

  /**
   * `PrismaClient` proxy available in interactive transactions.
   */
  export type TransactionClient = Omit<Prisma.DefaultPrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use'>

  export type Datasource = {
    url?: string
  }

  /**
   * Count Types
   */



  /**
   * Models
   */

  /**
   * Model Labels
   */


  export type AggregateLabels = {
    _count: LabelsCountAggregateOutputType | null
    _min: LabelsMinAggregateOutputType | null
    _max: LabelsMaxAggregateOutputType | null
  }

  export type LabelsMinAggregateOutputType = {
    id: string | null
    name: string | null
    color: string | null
    project_id: string | null
  }

  export type LabelsMaxAggregateOutputType = {
    id: string | null
    name: string | null
    color: string | null
    project_id: string | null
  }

  export type LabelsCountAggregateOutputType = {
    id: number
    name: number
    color: number
    project_id: number
    _all: number
  }


  export type LabelsMinAggregateInputType = {
    id?: true
    name?: true
    color?: true
    project_id?: true
  }

  export type LabelsMaxAggregateInputType = {
    id?: true
    name?: true
    color?: true
    project_id?: true
  }

  export type LabelsCountAggregateInputType = {
    id?: true
    name?: true
    color?: true
    project_id?: true
    _all?: true
  }

  export type LabelsAggregateArgs = {
    /**
     * Filter which Labels to aggregate.
     * 
    **/
    where?: LabelsWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Labels to fetch.
     * 
    **/
    orderBy?: Enumerable<LabelsOrderByWithRelationInput>
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the start position
     * 
    **/
    cursor?: LabelsWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Labels from the position of the cursor.
     * 
    **/
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Labels.
     * 
    **/
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Count returned Labels
    **/
    _count?: true | LabelsCountAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the minimum value
    **/
    _min?: LabelsMinAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the maximum value
    **/
    _max?: LabelsMaxAggregateInputType
  }

  export type GetLabelsAggregateType<T extends LabelsAggregateArgs> = {
        [P in keyof T & keyof AggregateLabels]: P extends '_count' | 'count'
      ? T[P] extends true
        ? number
        : GetScalarType<T[P], AggregateLabels[P]>
      : GetScalarType<T[P], AggregateLabels[P]>
  }




  export type LabelsGroupByArgs = {
    where?: LabelsWhereInput
    orderBy?: Enumerable<LabelsOrderByWithAggregationInput>
    by: Array<LabelsScalarFieldEnum>
    having?: LabelsScalarWhereWithAggregatesInput
    take?: number
    skip?: number
    _count?: LabelsCountAggregateInputType | true
    _min?: LabelsMinAggregateInputType
    _max?: LabelsMaxAggregateInputType
  }


  export type LabelsGroupByOutputType = {
    id: string
    name: string
    color: string | null
    project_id: string
    _count: LabelsCountAggregateOutputType | null
    _min: LabelsMinAggregateOutputType | null
    _max: LabelsMaxAggregateOutputType | null
  }

  type GetLabelsGroupByPayload<T extends LabelsGroupByArgs> = PrismaPromise<
    Array<
      PickArray<LabelsGroupByOutputType, T['by']> &
        {
          [P in ((keyof T) & (keyof LabelsGroupByOutputType))]: P extends '_count'
            ? T[P] extends boolean
              ? number
              : GetScalarType<T[P], LabelsGroupByOutputType[P]>
            : GetScalarType<T[P], LabelsGroupByOutputType[P]>
        }
      >
    >


  export type LabelsSelect = {
    id?: boolean
    name?: boolean
    color?: boolean
    project_id?: boolean
  }


  export type LabelsGetPayload<S extends boolean | null | undefined | LabelsArgs> =
    S extends { select: any, include: any } ? 'Please either choose `select` or `include`' :
    S extends true ? Labels :
    S extends undefined ? never :
    S extends { include: any } & (LabelsArgs | LabelsFindManyArgs)
    ? Labels 
    : S extends { select: any } & (LabelsArgs | LabelsFindManyArgs)
      ? {
    [P in TruthyKeys<S['select']>]:
    P extends keyof Labels ? Labels[P] : never
  } 
      : Labels


  type LabelsCountArgs = Merge<
    Omit<LabelsFindManyArgs, 'select' | 'include'> & {
      select?: LabelsCountAggregateInputType | true
    }
  >

  export interface LabelsDelegate<GlobalRejectSettings extends Prisma.RejectOnNotFound | Prisma.RejectPerOperation | false | undefined> {
    /**
     * Find zero or one Labels that matches the filter.
     * @param {LabelsFindUniqueArgs} args - Arguments to find a Labels
     * @example
     * // Get one Labels
     * const labels = await prisma.labels.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
    **/
    findUnique<T extends LabelsFindUniqueArgs,  LocalRejectSettings = T["rejectOnNotFound"] extends RejectOnNotFound ? T['rejectOnNotFound'] : undefined>(
      args: SelectSubset<T, LabelsFindUniqueArgs>
    ): HasReject<GlobalRejectSettings, LocalRejectSettings, 'findUnique', 'Labels'> extends True ? Prisma__LabelsClient<LabelsGetPayload<T>> : Prisma__LabelsClient<LabelsGetPayload<T> | null, null>

    /**
     * Find one Labels that matches the filter or throw an error  with `error.code='P2025'` 
     *     if no matches were found.
     * @param {LabelsFindUniqueOrThrowArgs} args - Arguments to find a Labels
     * @example
     * // Get one Labels
     * const labels = await prisma.labels.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
    **/
    findUniqueOrThrow<T extends LabelsFindUniqueOrThrowArgs>(
      args?: SelectSubset<T, LabelsFindUniqueOrThrowArgs>
    ): Prisma__LabelsClient<LabelsGetPayload<T>>

    /**
     * Find the first Labels that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {LabelsFindFirstArgs} args - Arguments to find a Labels
     * @example
     * // Get one Labels
     * const labels = await prisma.labels.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
    **/
    findFirst<T extends LabelsFindFirstArgs,  LocalRejectSettings = T["rejectOnNotFound"] extends RejectOnNotFound ? T['rejectOnNotFound'] : undefined>(
      args?: SelectSubset<T, LabelsFindFirstArgs>
    ): HasReject<GlobalRejectSettings, LocalRejectSettings, 'findFirst', 'Labels'> extends True ? Prisma__LabelsClient<LabelsGetPayload<T>> : Prisma__LabelsClient<LabelsGetPayload<T> | null, null>

    /**
     * Find the first Labels that matches the filter or
     * throw `NotFoundError` if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {LabelsFindFirstOrThrowArgs} args - Arguments to find a Labels
     * @example
     * // Get one Labels
     * const labels = await prisma.labels.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
    **/
    findFirstOrThrow<T extends LabelsFindFirstOrThrowArgs>(
      args?: SelectSubset<T, LabelsFindFirstOrThrowArgs>
    ): Prisma__LabelsClient<LabelsGetPayload<T>>

    /**
     * Find zero or more Labels that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {LabelsFindManyArgs=} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all Labels
     * const labels = await prisma.labels.findMany()
     * 
     * // Get first 10 Labels
     * const labels = await prisma.labels.findMany({ take: 10 })
     * 
     * // Only select the `id`
     * const labelsWithIdOnly = await prisma.labels.findMany({ select: { id: true } })
     * 
    **/
    findMany<T extends LabelsFindManyArgs>(
      args?: SelectSubset<T, LabelsFindManyArgs>
    ): PrismaPromise<Array<LabelsGetPayload<T>>>

    /**
     * Create a Labels.
     * @param {LabelsCreateArgs} args - Arguments to create a Labels.
     * @example
     * // Create one Labels
     * const Labels = await prisma.labels.create({
     *   data: {
     *     // ... data to create a Labels
     *   }
     * })
     * 
    **/
    create<T extends LabelsCreateArgs>(
      args: SelectSubset<T, LabelsCreateArgs>
    ): Prisma__LabelsClient<LabelsGetPayload<T>>

    /**
     * Create many Labels.
     *     @param {LabelsCreateManyArgs} args - Arguments to create many Labels.
     *     @example
     *     // Create many Labels
     *     const labels = await prisma.labels.createMany({
     *       data: {
     *         // ... provide data here
     *       }
     *     })
     *     
    **/
    createMany<T extends LabelsCreateManyArgs>(
      args?: SelectSubset<T, LabelsCreateManyArgs>
    ): PrismaPromise<BatchPayload>

    /**
     * Delete a Labels.
     * @param {LabelsDeleteArgs} args - Arguments to delete one Labels.
     * @example
     * // Delete one Labels
     * const Labels = await prisma.labels.delete({
     *   where: {
     *     // ... filter to delete one Labels
     *   }
     * })
     * 
    **/
    delete<T extends LabelsDeleteArgs>(
      args: SelectSubset<T, LabelsDeleteArgs>
    ): Prisma__LabelsClient<LabelsGetPayload<T>>

    /**
     * Update one Labels.
     * @param {LabelsUpdateArgs} args - Arguments to update one Labels.
     * @example
     * // Update one Labels
     * const labels = await prisma.labels.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
    **/
    update<T extends LabelsUpdateArgs>(
      args: SelectSubset<T, LabelsUpdateArgs>
    ): Prisma__LabelsClient<LabelsGetPayload<T>>

    /**
     * Delete zero or more Labels.
     * @param {LabelsDeleteManyArgs} args - Arguments to filter Labels to delete.
     * @example
     * // Delete a few Labels
     * const { count } = await prisma.labels.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     * 
    **/
    deleteMany<T extends LabelsDeleteManyArgs>(
      args?: SelectSubset<T, LabelsDeleteManyArgs>
    ): PrismaPromise<BatchPayload>

    /**
     * Update zero or more Labels.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {LabelsUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many Labels
     * const labels = await prisma.labels.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
    **/
    updateMany<T extends LabelsUpdateManyArgs>(
      args: SelectSubset<T, LabelsUpdateManyArgs>
    ): PrismaPromise<BatchPayload>

    /**
     * Create or update one Labels.
     * @param {LabelsUpsertArgs} args - Arguments to update or create a Labels.
     * @example
     * // Update or create a Labels
     * const labels = await prisma.labels.upsert({
     *   create: {
     *     // ... data to create a Labels
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the Labels we want to update
     *   }
     * })
    **/
    upsert<T extends LabelsUpsertArgs>(
      args: SelectSubset<T, LabelsUpsertArgs>
    ): Prisma__LabelsClient<LabelsGetPayload<T>>

    /**
     * Count the number of Labels.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {LabelsCountArgs} args - Arguments to filter Labels to count.
     * @example
     * // Count the number of Labels
     * const count = await prisma.labels.count({
     *   where: {
     *     // ... the filter for the Labels we want to count
     *   }
     * })
    **/
    count<T extends LabelsCountArgs>(
      args?: Subset<T, LabelsCountArgs>,
    ): PrismaPromise<
      T extends _Record<'select', any>
        ? T['select'] extends true
          ? number
          : GetScalarType<T['select'], LabelsCountAggregateOutputType>
        : number
    >

    /**
     * Allows you to perform aggregations operations on a Labels.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {LabelsAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
     * @example
     * // Ordered by age ascending
     * // Where email contains prisma.io
     * // Limited to the 10 users
     * const aggregations = await prisma.user.aggregate({
     *   _avg: {
     *     age: true,
     *   },
     *   where: {
     *     email: {
     *       contains: "prisma.io",
     *     },
     *   },
     *   orderBy: {
     *     age: "asc",
     *   },
     *   take: 10,
     * })
    **/
    aggregate<T extends LabelsAggregateArgs>(args: Subset<T, LabelsAggregateArgs>): PrismaPromise<GetLabelsAggregateType<T>>

    /**
     * Group by Labels.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {LabelsGroupByArgs} args - Group by arguments.
     * @example
     * // Group by city, order by createdAt, get count
     * const result = await prisma.user.groupBy({
     *   by: ['city', 'createdAt'],
     *   orderBy: {
     *     createdAt: true
     *   },
     *   _count: {
     *     _all: true
     *   },
     * })
     * 
    **/
    groupBy<
      T extends LabelsGroupByArgs,
      HasSelectOrTake extends Or<
        Extends<'skip', Keys<T>>,
        Extends<'take', Keys<T>>
      >,
      OrderByArg extends True extends HasSelectOrTake
        ? { orderBy: LabelsGroupByArgs['orderBy'] }
        : { orderBy?: LabelsGroupByArgs['orderBy'] },
      OrderFields extends ExcludeUnderscoreKeys<Keys<MaybeTupleToUnion<T['orderBy']>>>,
      ByFields extends TupleToUnion<T['by']>,
      ByValid extends Has<ByFields, OrderFields>,
      HavingFields extends GetHavingFields<T['having']>,
      HavingValid extends Has<ByFields, HavingFields>,
      ByEmpty extends T['by'] extends never[] ? True : False,
      InputErrors extends ByEmpty extends True
      ? `Error: "by" must not be empty.`
      : HavingValid extends False
      ? {
          [P in HavingFields]: P extends ByFields
            ? never
            : P extends string
            ? `Error: Field "${P}" used in "having" needs to be provided in "by".`
            : [
                Error,
                'Field ',
                P,
                ` in "having" needs to be provided in "by"`,
              ]
        }[HavingFields]
      : 'take' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "take", you also need to provide "orderBy"'
      : 'skip' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "skip", you also need to provide "orderBy"'
      : ByValid extends True
      ? {}
      : {
          [P in OrderFields]: P extends ByFields
            ? never
            : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
        }[OrderFields]
    >(args: SubsetIntersection<T, LabelsGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetLabelsGroupByPayload<T> : PrismaPromise<InputErrors>

  }

  /**
   * The delegate class that acts as a "Promise-like" for Labels.
   * Why is this prefixed with `Prisma__`?
   * Because we want to prevent naming conflicts as mentioned in
   * https://github.com/prisma/prisma-client-js/issues/707
   */
  export class Prisma__LabelsClient<T, Null = never> implements PrismaPromise<T> {
    [prisma]: true;
    private readonly _dmmf;
    private readonly _fetcher;
    private readonly _queryType;
    private readonly _rootField;
    private readonly _clientMethod;
    private readonly _args;
    private readonly _dataPath;
    private readonly _errorFormat;
    private readonly _measurePerformance?;
    private _isList;
    private _callsite;
    private _requestPromise?;
    constructor(_dmmf: runtime.DMMFClass, _fetcher: PrismaClientFetcher, _queryType: 'query' | 'mutation', _rootField: string, _clientMethod: string, _args: any, _dataPath: string[], _errorFormat: ErrorFormat, _measurePerformance?: boolean | undefined, _isList?: boolean);
    readonly [Symbol.toStringTag]: 'PrismaClientPromise';


    private get _document();
    /**
     * Attaches callbacks for the resolution and/or rejection of the Promise.
     * @param onfulfilled The callback to execute when the Promise is resolved.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of which ever callback is executed.
     */
    then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): Promise<TResult1 | TResult2>;
    /**
     * Attaches a callback for only the rejection of the Promise.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of the callback.
     */
    catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): Promise<T | TResult>;
    /**
     * Attaches a callback that is invoked when the Promise is settled (fulfilled or rejected). The
     * resolved value cannot be modified from the callback.
     * @param onfinally The callback to execute when the Promise is settled (fulfilled or rejected).
     * @returns A Promise for the completion of the callback.
     */
    finally(onfinally?: (() => void) | undefined | null): Promise<T>;
  }



  // Custom InputTypes

  /**
   * Labels base type for findUnique actions
   */
  export type LabelsFindUniqueArgsBase = {
    /**
     * Select specific fields to fetch from the Labels
     * 
    **/
    select?: LabelsSelect | null
    /**
     * Filter, which Labels to fetch.
     * 
    **/
    where: LabelsWhereUniqueInput
  }

  /**
   * Labels findUnique
   */
  export interface LabelsFindUniqueArgs extends LabelsFindUniqueArgsBase {
   /**
    * Throw an Error if query returns no results
    * @deprecated since 4.0.0: use `findUniqueOrThrow` method instead
    */
    rejectOnNotFound?: RejectOnNotFound
  }
      

  /**
   * Labels findUniqueOrThrow
   */
  export type LabelsFindUniqueOrThrowArgs = {
    /**
     * Select specific fields to fetch from the Labels
     * 
    **/
    select?: LabelsSelect | null
    /**
     * Filter, which Labels to fetch.
     * 
    **/
    where: LabelsWhereUniqueInput
  }


  /**
   * Labels base type for findFirst actions
   */
  export type LabelsFindFirstArgsBase = {
    /**
     * Select specific fields to fetch from the Labels
     * 
    **/
    select?: LabelsSelect | null
    /**
     * Filter, which Labels to fetch.
     * 
    **/
    where?: LabelsWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Labels to fetch.
     * 
    **/
    orderBy?: Enumerable<LabelsOrderByWithRelationInput>
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for Labels.
     * 
    **/
    cursor?: LabelsWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Labels from the position of the cursor.
     * 
    **/
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Labels.
     * 
    **/
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of Labels.
     * 
    **/
    distinct?: Enumerable<LabelsScalarFieldEnum>
  }

  /**
   * Labels findFirst
   */
  export interface LabelsFindFirstArgs extends LabelsFindFirstArgsBase {
   /**
    * Throw an Error if query returns no results
    * @deprecated since 4.0.0: use `findFirstOrThrow` method instead
    */
    rejectOnNotFound?: RejectOnNotFound
  }
      

  /**
   * Labels findFirstOrThrow
   */
  export type LabelsFindFirstOrThrowArgs = {
    /**
     * Select specific fields to fetch from the Labels
     * 
    **/
    select?: LabelsSelect | null
    /**
     * Filter, which Labels to fetch.
     * 
    **/
    where?: LabelsWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Labels to fetch.
     * 
    **/
    orderBy?: Enumerable<LabelsOrderByWithRelationInput>
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for Labels.
     * 
    **/
    cursor?: LabelsWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Labels from the position of the cursor.
     * 
    **/
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Labels.
     * 
    **/
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of Labels.
     * 
    **/
    distinct?: Enumerable<LabelsScalarFieldEnum>
  }


  /**
   * Labels findMany
   */
  export type LabelsFindManyArgs = {
    /**
     * Select specific fields to fetch from the Labels
     * 
    **/
    select?: LabelsSelect | null
    /**
     * Filter, which Labels to fetch.
     * 
    **/
    where?: LabelsWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Labels to fetch.
     * 
    **/
    orderBy?: Enumerable<LabelsOrderByWithRelationInput>
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for listing Labels.
     * 
    **/
    cursor?: LabelsWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Labels from the position of the cursor.
     * 
    **/
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Labels.
     * 
    **/
    skip?: number
    distinct?: Enumerable<LabelsScalarFieldEnum>
  }


  /**
   * Labels create
   */
  export type LabelsCreateArgs = {
    /**
     * Select specific fields to fetch from the Labels
     * 
    **/
    select?: LabelsSelect | null
    /**
     * The data needed to create a Labels.
     * 
    **/
    data: XOR<LabelsCreateInput, LabelsUncheckedCreateInput>
  }


  /**
   * Labels createMany
   */
  export type LabelsCreateManyArgs = {
    /**
     * The data used to create many Labels.
     * 
    **/
    data: Enumerable<LabelsCreateManyInput>
    skipDuplicates?: boolean
  }


  /**
   * Labels update
   */
  export type LabelsUpdateArgs = {
    /**
     * Select specific fields to fetch from the Labels
     * 
    **/
    select?: LabelsSelect | null
    /**
     * The data needed to update a Labels.
     * 
    **/
    data: XOR<LabelsUpdateInput, LabelsUncheckedUpdateInput>
    /**
     * Choose, which Labels to update.
     * 
    **/
    where: LabelsWhereUniqueInput
  }


  /**
   * Labels updateMany
   */
  export type LabelsUpdateManyArgs = {
    /**
     * The data used to update Labels.
     * 
    **/
    data: XOR<LabelsUpdateManyMutationInput, LabelsUncheckedUpdateManyInput>
    /**
     * Filter which Labels to update
     * 
    **/
    where?: LabelsWhereInput
  }


  /**
   * Labels upsert
   */
  export type LabelsUpsertArgs = {
    /**
     * Select specific fields to fetch from the Labels
     * 
    **/
    select?: LabelsSelect | null
    /**
     * The filter to search for the Labels to update in case it exists.
     * 
    **/
    where: LabelsWhereUniqueInput
    /**
     * In case the Labels found by the `where` argument doesn't exist, create a new Labels with this data.
     * 
    **/
    create: XOR<LabelsCreateInput, LabelsUncheckedCreateInput>
    /**
     * In case the Labels was found with the provided `where` argument, update it with this data.
     * 
    **/
    update: XOR<LabelsUpdateInput, LabelsUncheckedUpdateInput>
  }


  /**
   * Labels delete
   */
  export type LabelsDeleteArgs = {
    /**
     * Select specific fields to fetch from the Labels
     * 
    **/
    select?: LabelsSelect | null
    /**
     * Filter which Labels to delete.
     * 
    **/
    where: LabelsWhereUniqueInput
  }


  /**
   * Labels deleteMany
   */
  export type LabelsDeleteManyArgs = {
    /**
     * Filter which Labels to delete
     * 
    **/
    where?: LabelsWhereInput
  }


  /**
   * Labels without action
   */
  export type LabelsArgs = {
    /**
     * Select specific fields to fetch from the Labels
     * 
    **/
    select?: LabelsSelect | null
  }



  /**
   * Model Tasks
   */


  export type AggregateTasks = {
    _count: TasksCountAggregateOutputType | null
    _avg: TasksAvgAggregateOutputType | null
    _sum: TasksSumAggregateOutputType | null
    _min: TasksMinAggregateOutputType | null
    _max: TasksMaxAggregateOutputType | null
  }

  export type TasksAvgAggregateOutputType = {
    impact: number | null
    sort_order: number | null
    status: number | null
  }

  export type TasksSumAggregateOutputType = {
    impact: number | null
    sort_order: number | null
    status: number | null
  }

  export type TasksMinAggregateOutputType = {
    id: string | null
    slug: string | null
    markdown: string | null
    summary: string | null
    type: string | null
    impact: number | null
    sort_order: number | null
    status: number | null
    project_id: string | null
    created_at: Date | null
    created_by: string | null
    assigned_by: string | null
    assigned_at: Date | null
    modified_at: Date | null
    modified_by: string | null
  }

  export type TasksMaxAggregateOutputType = {
    id: string | null
    slug: string | null
    markdown: string | null
    summary: string | null
    type: string | null
    impact: number | null
    sort_order: number | null
    status: number | null
    project_id: string | null
    created_at: Date | null
    created_by: string | null
    assigned_by: string | null
    assigned_at: Date | null
    modified_at: Date | null
    modified_by: string | null
  }

  export type TasksCountAggregateOutputType = {
    id: number
    slug: number
    markdown: number
    summary: number
    type: number
    impact: number
    sort_order: number
    status: number
    project_id: number
    created_at: number
    created_by: number
    assigned_by: number
    assigned_at: number
    modified_at: number
    modified_by: number
    _all: number
  }


  export type TasksAvgAggregateInputType = {
    impact?: true
    sort_order?: true
    status?: true
  }

  export type TasksSumAggregateInputType = {
    impact?: true
    sort_order?: true
    status?: true
  }

  export type TasksMinAggregateInputType = {
    id?: true
    slug?: true
    markdown?: true
    summary?: true
    type?: true
    impact?: true
    sort_order?: true
    status?: true
    project_id?: true
    created_at?: true
    created_by?: true
    assigned_by?: true
    assigned_at?: true
    modified_at?: true
    modified_by?: true
  }

  export type TasksMaxAggregateInputType = {
    id?: true
    slug?: true
    markdown?: true
    summary?: true
    type?: true
    impact?: true
    sort_order?: true
    status?: true
    project_id?: true
    created_at?: true
    created_by?: true
    assigned_by?: true
    assigned_at?: true
    modified_at?: true
    modified_by?: true
  }

  export type TasksCountAggregateInputType = {
    id?: true
    slug?: true
    markdown?: true
    summary?: true
    type?: true
    impact?: true
    sort_order?: true
    status?: true
    project_id?: true
    created_at?: true
    created_by?: true
    assigned_by?: true
    assigned_at?: true
    modified_at?: true
    modified_by?: true
    _all?: true
  }

  export type TasksAggregateArgs = {
    /**
     * Filter which Tasks to aggregate.
     * 
    **/
    where?: TasksWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Tasks to fetch.
     * 
    **/
    orderBy?: Enumerable<TasksOrderByWithRelationInput>
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the start position
     * 
    **/
    cursor?: TasksWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Tasks from the position of the cursor.
     * 
    **/
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Tasks.
     * 
    **/
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Count returned Tasks
    **/
    _count?: true | TasksCountAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to average
    **/
    _avg?: TasksAvgAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to sum
    **/
    _sum?: TasksSumAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the minimum value
    **/
    _min?: TasksMinAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the maximum value
    **/
    _max?: TasksMaxAggregateInputType
  }

  export type GetTasksAggregateType<T extends TasksAggregateArgs> = {
        [P in keyof T & keyof AggregateTasks]: P extends '_count' | 'count'
      ? T[P] extends true
        ? number
        : GetScalarType<T[P], AggregateTasks[P]>
      : GetScalarType<T[P], AggregateTasks[P]>
  }




  export type TasksGroupByArgs = {
    where?: TasksWhereInput
    orderBy?: Enumerable<TasksOrderByWithAggregationInput>
    by: Array<TasksScalarFieldEnum>
    having?: TasksScalarWhereWithAggregatesInput
    take?: number
    skip?: number
    _count?: TasksCountAggregateInputType | true
    _avg?: TasksAvgAggregateInputType
    _sum?: TasksSumAggregateInputType
    _min?: TasksMinAggregateInputType
    _max?: TasksMaxAggregateInputType
  }


  export type TasksGroupByOutputType = {
    id: string
    slug: string
    markdown: string | null
    summary: string
    type: string
    impact: number | null
    sort_order: number | null
    status: number
    project_id: string
    created_at: Date
    created_by: string
    assigned_by: string | null
    assigned_at: Date | null
    modified_at: Date | null
    modified_by: string | null
    _count: TasksCountAggregateOutputType | null
    _avg: TasksAvgAggregateOutputType | null
    _sum: TasksSumAggregateOutputType | null
    _min: TasksMinAggregateOutputType | null
    _max: TasksMaxAggregateOutputType | null
  }

  type GetTasksGroupByPayload<T extends TasksGroupByArgs> = PrismaPromise<
    Array<
      PickArray<TasksGroupByOutputType, T['by']> &
        {
          [P in ((keyof T) & (keyof TasksGroupByOutputType))]: P extends '_count'
            ? T[P] extends boolean
              ? number
              : GetScalarType<T[P], TasksGroupByOutputType[P]>
            : GetScalarType<T[P], TasksGroupByOutputType[P]>
        }
      >
    >


  export type TasksSelect = {
    id?: boolean
    slug?: boolean
    markdown?: boolean
    summary?: boolean
    type?: boolean
    impact?: boolean
    sort_order?: boolean
    status?: boolean
    project_id?: boolean
    created_at?: boolean
    created_by?: boolean
    assigned_by?: boolean
    assigned_at?: boolean
    modified_at?: boolean
    modified_by?: boolean
  }


  export type TasksGetPayload<S extends boolean | null | undefined | TasksArgs> =
    S extends { select: any, include: any } ? 'Please either choose `select` or `include`' :
    S extends true ? Tasks :
    S extends undefined ? never :
    S extends { include: any } & (TasksArgs | TasksFindManyArgs)
    ? Tasks 
    : S extends { select: any } & (TasksArgs | TasksFindManyArgs)
      ? {
    [P in TruthyKeys<S['select']>]:
    P extends keyof Tasks ? Tasks[P] : never
  } 
      : Tasks


  type TasksCountArgs = Merge<
    Omit<TasksFindManyArgs, 'select' | 'include'> & {
      select?: TasksCountAggregateInputType | true
    }
  >

  export interface TasksDelegate<GlobalRejectSettings extends Prisma.RejectOnNotFound | Prisma.RejectPerOperation | false | undefined> {
    /**
     * Find zero or one Tasks that matches the filter.
     * @param {TasksFindUniqueArgs} args - Arguments to find a Tasks
     * @example
     * // Get one Tasks
     * const tasks = await prisma.tasks.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
    **/
    findUnique<T extends TasksFindUniqueArgs,  LocalRejectSettings = T["rejectOnNotFound"] extends RejectOnNotFound ? T['rejectOnNotFound'] : undefined>(
      args: SelectSubset<T, TasksFindUniqueArgs>
    ): HasReject<GlobalRejectSettings, LocalRejectSettings, 'findUnique', 'Tasks'> extends True ? Prisma__TasksClient<TasksGetPayload<T>> : Prisma__TasksClient<TasksGetPayload<T> | null, null>

    /**
     * Find one Tasks that matches the filter or throw an error  with `error.code='P2025'` 
     *     if no matches were found.
     * @param {TasksFindUniqueOrThrowArgs} args - Arguments to find a Tasks
     * @example
     * // Get one Tasks
     * const tasks = await prisma.tasks.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
    **/
    findUniqueOrThrow<T extends TasksFindUniqueOrThrowArgs>(
      args?: SelectSubset<T, TasksFindUniqueOrThrowArgs>
    ): Prisma__TasksClient<TasksGetPayload<T>>

    /**
     * Find the first Tasks that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {TasksFindFirstArgs} args - Arguments to find a Tasks
     * @example
     * // Get one Tasks
     * const tasks = await prisma.tasks.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
    **/
    findFirst<T extends TasksFindFirstArgs,  LocalRejectSettings = T["rejectOnNotFound"] extends RejectOnNotFound ? T['rejectOnNotFound'] : undefined>(
      args?: SelectSubset<T, TasksFindFirstArgs>
    ): HasReject<GlobalRejectSettings, LocalRejectSettings, 'findFirst', 'Tasks'> extends True ? Prisma__TasksClient<TasksGetPayload<T>> : Prisma__TasksClient<TasksGetPayload<T> | null, null>

    /**
     * Find the first Tasks that matches the filter or
     * throw `NotFoundError` if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {TasksFindFirstOrThrowArgs} args - Arguments to find a Tasks
     * @example
     * // Get one Tasks
     * const tasks = await prisma.tasks.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
    **/
    findFirstOrThrow<T extends TasksFindFirstOrThrowArgs>(
      args?: SelectSubset<T, TasksFindFirstOrThrowArgs>
    ): Prisma__TasksClient<TasksGetPayload<T>>

    /**
     * Find zero or more Tasks that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {TasksFindManyArgs=} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all Tasks
     * const tasks = await prisma.tasks.findMany()
     * 
     * // Get first 10 Tasks
     * const tasks = await prisma.tasks.findMany({ take: 10 })
     * 
     * // Only select the `id`
     * const tasksWithIdOnly = await prisma.tasks.findMany({ select: { id: true } })
     * 
    **/
    findMany<T extends TasksFindManyArgs>(
      args?: SelectSubset<T, TasksFindManyArgs>
    ): PrismaPromise<Array<TasksGetPayload<T>>>

    /**
     * Create a Tasks.
     * @param {TasksCreateArgs} args - Arguments to create a Tasks.
     * @example
     * // Create one Tasks
     * const Tasks = await prisma.tasks.create({
     *   data: {
     *     // ... data to create a Tasks
     *   }
     * })
     * 
    **/
    create<T extends TasksCreateArgs>(
      args: SelectSubset<T, TasksCreateArgs>
    ): Prisma__TasksClient<TasksGetPayload<T>>

    /**
     * Create many Tasks.
     *     @param {TasksCreateManyArgs} args - Arguments to create many Tasks.
     *     @example
     *     // Create many Tasks
     *     const tasks = await prisma.tasks.createMany({
     *       data: {
     *         // ... provide data here
     *       }
     *     })
     *     
    **/
    createMany<T extends TasksCreateManyArgs>(
      args?: SelectSubset<T, TasksCreateManyArgs>
    ): PrismaPromise<BatchPayload>

    /**
     * Delete a Tasks.
     * @param {TasksDeleteArgs} args - Arguments to delete one Tasks.
     * @example
     * // Delete one Tasks
     * const Tasks = await prisma.tasks.delete({
     *   where: {
     *     // ... filter to delete one Tasks
     *   }
     * })
     * 
    **/
    delete<T extends TasksDeleteArgs>(
      args: SelectSubset<T, TasksDeleteArgs>
    ): Prisma__TasksClient<TasksGetPayload<T>>

    /**
     * Update one Tasks.
     * @param {TasksUpdateArgs} args - Arguments to update one Tasks.
     * @example
     * // Update one Tasks
     * const tasks = await prisma.tasks.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
    **/
    update<T extends TasksUpdateArgs>(
      args: SelectSubset<T, TasksUpdateArgs>
    ): Prisma__TasksClient<TasksGetPayload<T>>

    /**
     * Delete zero or more Tasks.
     * @param {TasksDeleteManyArgs} args - Arguments to filter Tasks to delete.
     * @example
     * // Delete a few Tasks
     * const { count } = await prisma.tasks.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     * 
    **/
    deleteMany<T extends TasksDeleteManyArgs>(
      args?: SelectSubset<T, TasksDeleteManyArgs>
    ): PrismaPromise<BatchPayload>

    /**
     * Update zero or more Tasks.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {TasksUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many Tasks
     * const tasks = await prisma.tasks.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
    **/
    updateMany<T extends TasksUpdateManyArgs>(
      args: SelectSubset<T, TasksUpdateManyArgs>
    ): PrismaPromise<BatchPayload>

    /**
     * Create or update one Tasks.
     * @param {TasksUpsertArgs} args - Arguments to update or create a Tasks.
     * @example
     * // Update or create a Tasks
     * const tasks = await prisma.tasks.upsert({
     *   create: {
     *     // ... data to create a Tasks
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the Tasks we want to update
     *   }
     * })
    **/
    upsert<T extends TasksUpsertArgs>(
      args: SelectSubset<T, TasksUpsertArgs>
    ): Prisma__TasksClient<TasksGetPayload<T>>

    /**
     * Count the number of Tasks.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {TasksCountArgs} args - Arguments to filter Tasks to count.
     * @example
     * // Count the number of Tasks
     * const count = await prisma.tasks.count({
     *   where: {
     *     // ... the filter for the Tasks we want to count
     *   }
     * })
    **/
    count<T extends TasksCountArgs>(
      args?: Subset<T, TasksCountArgs>,
    ): PrismaPromise<
      T extends _Record<'select', any>
        ? T['select'] extends true
          ? number
          : GetScalarType<T['select'], TasksCountAggregateOutputType>
        : number
    >

    /**
     * Allows you to perform aggregations operations on a Tasks.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {TasksAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
     * @example
     * // Ordered by age ascending
     * // Where email contains prisma.io
     * // Limited to the 10 users
     * const aggregations = await prisma.user.aggregate({
     *   _avg: {
     *     age: true,
     *   },
     *   where: {
     *     email: {
     *       contains: "prisma.io",
     *     },
     *   },
     *   orderBy: {
     *     age: "asc",
     *   },
     *   take: 10,
     * })
    **/
    aggregate<T extends TasksAggregateArgs>(args: Subset<T, TasksAggregateArgs>): PrismaPromise<GetTasksAggregateType<T>>

    /**
     * Group by Tasks.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {TasksGroupByArgs} args - Group by arguments.
     * @example
     * // Group by city, order by createdAt, get count
     * const result = await prisma.user.groupBy({
     *   by: ['city', 'createdAt'],
     *   orderBy: {
     *     createdAt: true
     *   },
     *   _count: {
     *     _all: true
     *   },
     * })
     * 
    **/
    groupBy<
      T extends TasksGroupByArgs,
      HasSelectOrTake extends Or<
        Extends<'skip', Keys<T>>,
        Extends<'take', Keys<T>>
      >,
      OrderByArg extends True extends HasSelectOrTake
        ? { orderBy: TasksGroupByArgs['orderBy'] }
        : { orderBy?: TasksGroupByArgs['orderBy'] },
      OrderFields extends ExcludeUnderscoreKeys<Keys<MaybeTupleToUnion<T['orderBy']>>>,
      ByFields extends TupleToUnion<T['by']>,
      ByValid extends Has<ByFields, OrderFields>,
      HavingFields extends GetHavingFields<T['having']>,
      HavingValid extends Has<ByFields, HavingFields>,
      ByEmpty extends T['by'] extends never[] ? True : False,
      InputErrors extends ByEmpty extends True
      ? `Error: "by" must not be empty.`
      : HavingValid extends False
      ? {
          [P in HavingFields]: P extends ByFields
            ? never
            : P extends string
            ? `Error: Field "${P}" used in "having" needs to be provided in "by".`
            : [
                Error,
                'Field ',
                P,
                ` in "having" needs to be provided in "by"`,
              ]
        }[HavingFields]
      : 'take' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "take", you also need to provide "orderBy"'
      : 'skip' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "skip", you also need to provide "orderBy"'
      : ByValid extends True
      ? {}
      : {
          [P in OrderFields]: P extends ByFields
            ? never
            : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
        }[OrderFields]
    >(args: SubsetIntersection<T, TasksGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetTasksGroupByPayload<T> : PrismaPromise<InputErrors>

  }

  /**
   * The delegate class that acts as a "Promise-like" for Tasks.
   * Why is this prefixed with `Prisma__`?
   * Because we want to prevent naming conflicts as mentioned in
   * https://github.com/prisma/prisma-client-js/issues/707
   */
  export class Prisma__TasksClient<T, Null = never> implements PrismaPromise<T> {
    [prisma]: true;
    private readonly _dmmf;
    private readonly _fetcher;
    private readonly _queryType;
    private readonly _rootField;
    private readonly _clientMethod;
    private readonly _args;
    private readonly _dataPath;
    private readonly _errorFormat;
    private readonly _measurePerformance?;
    private _isList;
    private _callsite;
    private _requestPromise?;
    constructor(_dmmf: runtime.DMMFClass, _fetcher: PrismaClientFetcher, _queryType: 'query' | 'mutation', _rootField: string, _clientMethod: string, _args: any, _dataPath: string[], _errorFormat: ErrorFormat, _measurePerformance?: boolean | undefined, _isList?: boolean);
    readonly [Symbol.toStringTag]: 'PrismaClientPromise';


    private get _document();
    /**
     * Attaches callbacks for the resolution and/or rejection of the Promise.
     * @param onfulfilled The callback to execute when the Promise is resolved.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of which ever callback is executed.
     */
    then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): Promise<TResult1 | TResult2>;
    /**
     * Attaches a callback for only the rejection of the Promise.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of the callback.
     */
    catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): Promise<T | TResult>;
    /**
     * Attaches a callback that is invoked when the Promise is settled (fulfilled or rejected). The
     * resolved value cannot be modified from the callback.
     * @param onfinally The callback to execute when the Promise is settled (fulfilled or rejected).
     * @returns A Promise for the completion of the callback.
     */
    finally(onfinally?: (() => void) | undefined | null): Promise<T>;
  }



  // Custom InputTypes

  /**
   * Tasks base type for findUnique actions
   */
  export type TasksFindUniqueArgsBase = {
    /**
     * Select specific fields to fetch from the Tasks
     * 
    **/
    select?: TasksSelect | null
    /**
     * Filter, which Tasks to fetch.
     * 
    **/
    where: TasksWhereUniqueInput
  }

  /**
   * Tasks findUnique
   */
  export interface TasksFindUniqueArgs extends TasksFindUniqueArgsBase {
   /**
    * Throw an Error if query returns no results
    * @deprecated since 4.0.0: use `findUniqueOrThrow` method instead
    */
    rejectOnNotFound?: RejectOnNotFound
  }
      

  /**
   * Tasks findUniqueOrThrow
   */
  export type TasksFindUniqueOrThrowArgs = {
    /**
     * Select specific fields to fetch from the Tasks
     * 
    **/
    select?: TasksSelect | null
    /**
     * Filter, which Tasks to fetch.
     * 
    **/
    where: TasksWhereUniqueInput
  }


  /**
   * Tasks base type for findFirst actions
   */
  export type TasksFindFirstArgsBase = {
    /**
     * Select specific fields to fetch from the Tasks
     * 
    **/
    select?: TasksSelect | null
    /**
     * Filter, which Tasks to fetch.
     * 
    **/
    where?: TasksWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Tasks to fetch.
     * 
    **/
    orderBy?: Enumerable<TasksOrderByWithRelationInput>
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for Tasks.
     * 
    **/
    cursor?: TasksWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Tasks from the position of the cursor.
     * 
    **/
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Tasks.
     * 
    **/
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of Tasks.
     * 
    **/
    distinct?: Enumerable<TasksScalarFieldEnum>
  }

  /**
   * Tasks findFirst
   */
  export interface TasksFindFirstArgs extends TasksFindFirstArgsBase {
   /**
    * Throw an Error if query returns no results
    * @deprecated since 4.0.0: use `findFirstOrThrow` method instead
    */
    rejectOnNotFound?: RejectOnNotFound
  }
      

  /**
   * Tasks findFirstOrThrow
   */
  export type TasksFindFirstOrThrowArgs = {
    /**
     * Select specific fields to fetch from the Tasks
     * 
    **/
    select?: TasksSelect | null
    /**
     * Filter, which Tasks to fetch.
     * 
    **/
    where?: TasksWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Tasks to fetch.
     * 
    **/
    orderBy?: Enumerable<TasksOrderByWithRelationInput>
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for Tasks.
     * 
    **/
    cursor?: TasksWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Tasks from the position of the cursor.
     * 
    **/
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Tasks.
     * 
    **/
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of Tasks.
     * 
    **/
    distinct?: Enumerable<TasksScalarFieldEnum>
  }


  /**
   * Tasks findMany
   */
  export type TasksFindManyArgs = {
    /**
     * Select specific fields to fetch from the Tasks
     * 
    **/
    select?: TasksSelect | null
    /**
     * Filter, which Tasks to fetch.
     * 
    **/
    where?: TasksWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Tasks to fetch.
     * 
    **/
    orderBy?: Enumerable<TasksOrderByWithRelationInput>
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for listing Tasks.
     * 
    **/
    cursor?: TasksWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Tasks from the position of the cursor.
     * 
    **/
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Tasks.
     * 
    **/
    skip?: number
    distinct?: Enumerable<TasksScalarFieldEnum>
  }


  /**
   * Tasks create
   */
  export type TasksCreateArgs = {
    /**
     * Select specific fields to fetch from the Tasks
     * 
    **/
    select?: TasksSelect | null
    /**
     * The data needed to create a Tasks.
     * 
    **/
    data: XOR<TasksCreateInput, TasksUncheckedCreateInput>
  }


  /**
   * Tasks createMany
   */
  export type TasksCreateManyArgs = {
    /**
     * The data used to create many Tasks.
     * 
    **/
    data: Enumerable<TasksCreateManyInput>
    skipDuplicates?: boolean
  }


  /**
   * Tasks update
   */
  export type TasksUpdateArgs = {
    /**
     * Select specific fields to fetch from the Tasks
     * 
    **/
    select?: TasksSelect | null
    /**
     * The data needed to update a Tasks.
     * 
    **/
    data: XOR<TasksUpdateInput, TasksUncheckedUpdateInput>
    /**
     * Choose, which Tasks to update.
     * 
    **/
    where: TasksWhereUniqueInput
  }


  /**
   * Tasks updateMany
   */
  export type TasksUpdateManyArgs = {
    /**
     * The data used to update Tasks.
     * 
    **/
    data: XOR<TasksUpdateManyMutationInput, TasksUncheckedUpdateManyInput>
    /**
     * Filter which Tasks to update
     * 
    **/
    where?: TasksWhereInput
  }


  /**
   * Tasks upsert
   */
  export type TasksUpsertArgs = {
    /**
     * Select specific fields to fetch from the Tasks
     * 
    **/
    select?: TasksSelect | null
    /**
     * The filter to search for the Tasks to update in case it exists.
     * 
    **/
    where: TasksWhereUniqueInput
    /**
     * In case the Tasks found by the `where` argument doesn't exist, create a new Tasks with this data.
     * 
    **/
    create: XOR<TasksCreateInput, TasksUncheckedCreateInput>
    /**
     * In case the Tasks was found with the provided `where` argument, update it with this data.
     * 
    **/
    update: XOR<TasksUpdateInput, TasksUncheckedUpdateInput>
  }


  /**
   * Tasks delete
   */
  export type TasksDeleteArgs = {
    /**
     * Select specific fields to fetch from the Tasks
     * 
    **/
    select?: TasksSelect | null
    /**
     * Filter which Tasks to delete.
     * 
    **/
    where: TasksWhereUniqueInput
  }


  /**
   * Tasks deleteMany
   */
  export type TasksDeleteManyArgs = {
    /**
     * Filter which Tasks to delete
     * 
    **/
    where?: TasksWhereInput
  }


  /**
   * Tasks without action
   */
  export type TasksArgs = {
    /**
     * Select specific fields to fetch from the Tasks
     * 
    **/
    select?: TasksSelect | null
  }



  /**
   * Enums
   */

  // Based on
  // https://github.com/microsoft/TypeScript/issues/3192#issuecomment-261720275

  export const TransactionIsolationLevel: {
    ReadUncommitted: 'ReadUncommitted',
    ReadCommitted: 'ReadCommitted',
    RepeatableRead: 'RepeatableRead',
    Serializable: 'Serializable'
  };

  export type TransactionIsolationLevel = (typeof TransactionIsolationLevel)[keyof typeof TransactionIsolationLevel]


  export const LabelsScalarFieldEnum: {
    id: 'id',
    name: 'name',
    color: 'color',
    project_id: 'project_id'
  };

  export type LabelsScalarFieldEnum = (typeof LabelsScalarFieldEnum)[keyof typeof LabelsScalarFieldEnum]


  export const TasksScalarFieldEnum: {
    id: 'id',
    slug: 'slug',
    markdown: 'markdown',
    summary: 'summary',
    type: 'type',
    impact: 'impact',
    sort_order: 'sort_order',
    status: 'status',
    project_id: 'project_id',
    created_at: 'created_at',
    created_by: 'created_by',
    assigned_by: 'assigned_by',
    assigned_at: 'assigned_at',
    modified_at: 'modified_at',
    modified_by: 'modified_by'
  };

  export type TasksScalarFieldEnum = (typeof TasksScalarFieldEnum)[keyof typeof TasksScalarFieldEnum]


  export const SortOrder: {
    asc: 'asc',
    desc: 'desc'
  };

  export type SortOrder = (typeof SortOrder)[keyof typeof SortOrder]


  export const QueryMode: {
    default: 'default',
    insensitive: 'insensitive'
  };

  export type QueryMode = (typeof QueryMode)[keyof typeof QueryMode]


  export const NullsOrder: {
    first: 'first',
    last: 'last'
  };

  export type NullsOrder = (typeof NullsOrder)[keyof typeof NullsOrder]


  /**
   * Field references 
   */


  /**
   * Reference to a field of type 'String'
   */
  export type StringFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'String'>
    


  /**
   * Reference to a field of type 'String[]'
   */
  export type ListStringFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'String[]'>
    


  /**
   * Reference to a field of type 'Int'
   */
  export type IntFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'Int'>
    


  /**
   * Reference to a field of type 'Int[]'
   */
  export type ListIntFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'Int[]'>
    


  /**
   * Reference to a field of type 'DateTime'
   */
  export type DateTimeFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'DateTime'>
    


  /**
   * Reference to a field of type 'DateTime[]'
   */
  export type ListDateTimeFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'DateTime[]'>
    


  /**
   * Reference to a field of type 'Float'
   */
  export type FloatFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'Float'>
    


  /**
   * Reference to a field of type 'Float[]'
   */
  export type ListFloatFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'Float[]'>
    
  /**
   * Deep Input Types
   */


  export type LabelsWhereInput = {
    AND?: Enumerable<LabelsWhereInput>
    OR?: Enumerable<LabelsWhereInput>
    NOT?: Enumerable<LabelsWhereInput>
    id?: StringFilter<"Labels"> | string
    name?: StringFilter<"Labels"> | string
    color?: StringNullableFilter<"Labels"> | string | null
    project_id?: StringFilter<"Labels"> | string
  }

  export type LabelsOrderByWithRelationInput = {
    id?: SortOrder
    name?: SortOrder
    color?: SortOrderInput | SortOrder
    project_id?: SortOrder
  }

  export type LabelsWhereUniqueInput = Prisma.AtLeast<{
    id?: string
    AND?: Enumerable<LabelsWhereInput>
    OR?: Enumerable<LabelsWhereInput>
    NOT?: Enumerable<LabelsWhereInput>
    name?: StringFilter<"Labels"> | string
    color?: StringNullableFilter<"Labels"> | string | null
    project_id?: StringFilter<"Labels"> | string
  }, "id">

  export type LabelsOrderByWithAggregationInput = {
    id?: SortOrder
    name?: SortOrder
    color?: SortOrderInput | SortOrder
    project_id?: SortOrder
    _count?: LabelsCountOrderByAggregateInput
    _max?: LabelsMaxOrderByAggregateInput
    _min?: LabelsMinOrderByAggregateInput
  }

  export type LabelsScalarWhereWithAggregatesInput = {
    AND?: Enumerable<LabelsScalarWhereWithAggregatesInput>
    OR?: Enumerable<LabelsScalarWhereWithAggregatesInput>
    NOT?: Enumerable<LabelsScalarWhereWithAggregatesInput>
    id?: StringWithAggregatesFilter<"Labels"> | string
    name?: StringWithAggregatesFilter<"Labels"> | string
    color?: StringNullableWithAggregatesFilter<"Labels"> | string | null
    project_id?: StringWithAggregatesFilter<"Labels"> | string
  }

  export type TasksWhereInput = {
    AND?: Enumerable<TasksWhereInput>
    OR?: Enumerable<TasksWhereInput>
    NOT?: Enumerable<TasksWhereInput>
    id?: StringFilter<"Tasks"> | string
    slug?: StringFilter<"Tasks"> | string
    markdown?: StringNullableFilter<"Tasks"> | string | null
    summary?: StringFilter<"Tasks"> | string
    type?: StringFilter<"Tasks"> | string
    impact?: IntNullableFilter<"Tasks"> | number | null
    sort_order?: IntNullableFilter<"Tasks"> | number | null
    status?: IntFilter<"Tasks"> | number
    project_id?: StringFilter<"Tasks"> | string
    created_at?: DateTimeFilter<"Tasks"> | Date | string
    created_by?: StringFilter<"Tasks"> | string
    assigned_by?: StringNullableFilter<"Tasks"> | string | null
    assigned_at?: DateTimeNullableFilter<"Tasks"> | Date | string | null
    modified_at?: DateTimeNullableFilter<"Tasks"> | Date | string | null
    modified_by?: StringNullableFilter<"Tasks"> | string | null
  }

  export type TasksOrderByWithRelationInput = {
    id?: SortOrder
    slug?: SortOrder
    markdown?: SortOrderInput | SortOrder
    summary?: SortOrder
    type?: SortOrder
    impact?: SortOrderInput | SortOrder
    sort_order?: SortOrderInput | SortOrder
    status?: SortOrder
    project_id?: SortOrder
    created_at?: SortOrder
    created_by?: SortOrder
    assigned_by?: SortOrderInput | SortOrder
    assigned_at?: SortOrderInput | SortOrder
    modified_at?: SortOrderInput | SortOrder
    modified_by?: SortOrderInput | SortOrder
  }

  export type TasksWhereUniqueInput = Prisma.AtLeast<{
    id?: string
    AND?: Enumerable<TasksWhereInput>
    OR?: Enumerable<TasksWhereInput>
    NOT?: Enumerable<TasksWhereInput>
    slug?: StringFilter<"Tasks"> | string
    markdown?: StringNullableFilter<"Tasks"> | string | null
    summary?: StringFilter<"Tasks"> | string
    type?: StringFilter<"Tasks"> | string
    impact?: IntNullableFilter<"Tasks"> | number | null
    sort_order?: IntNullableFilter<"Tasks"> | number | null
    status?: IntFilter<"Tasks"> | number
    project_id?: StringFilter<"Tasks"> | string
    created_at?: DateTimeFilter<"Tasks"> | Date | string
    created_by?: StringFilter<"Tasks"> | string
    assigned_by?: StringNullableFilter<"Tasks"> | string | null
    assigned_at?: DateTimeNullableFilter<"Tasks"> | Date | string | null
    modified_at?: DateTimeNullableFilter<"Tasks"> | Date | string | null
    modified_by?: StringNullableFilter<"Tasks"> | string | null
  }, "id">

  export type TasksOrderByWithAggregationInput = {
    id?: SortOrder
    slug?: SortOrder
    markdown?: SortOrderInput | SortOrder
    summary?: SortOrder
    type?: SortOrder
    impact?: SortOrderInput | SortOrder
    sort_order?: SortOrderInput | SortOrder
    status?: SortOrder
    project_id?: SortOrder
    created_at?: SortOrder
    created_by?: SortOrder
    assigned_by?: SortOrderInput | SortOrder
    assigned_at?: SortOrderInput | SortOrder
    modified_at?: SortOrderInput | SortOrder
    modified_by?: SortOrderInput | SortOrder
    _count?: TasksCountOrderByAggregateInput
    _avg?: TasksAvgOrderByAggregateInput
    _max?: TasksMaxOrderByAggregateInput
    _min?: TasksMinOrderByAggregateInput
    _sum?: TasksSumOrderByAggregateInput
  }

  export type TasksScalarWhereWithAggregatesInput = {
    AND?: Enumerable<TasksScalarWhereWithAggregatesInput>
    OR?: Enumerable<TasksScalarWhereWithAggregatesInput>
    NOT?: Enumerable<TasksScalarWhereWithAggregatesInput>
    id?: StringWithAggregatesFilter<"Tasks"> | string
    slug?: StringWithAggregatesFilter<"Tasks"> | string
    markdown?: StringNullableWithAggregatesFilter<"Tasks"> | string | null
    summary?: StringWithAggregatesFilter<"Tasks"> | string
    type?: StringWithAggregatesFilter<"Tasks"> | string
    impact?: IntNullableWithAggregatesFilter<"Tasks"> | number | null
    sort_order?: IntNullableWithAggregatesFilter<"Tasks"> | number | null
    status?: IntWithAggregatesFilter<"Tasks"> | number
    project_id?: StringWithAggregatesFilter<"Tasks"> | string
    created_at?: DateTimeWithAggregatesFilter<"Tasks"> | Date | string
    created_by?: StringWithAggregatesFilter<"Tasks"> | string
    assigned_by?: StringNullableWithAggregatesFilter<"Tasks"> | string | null
    assigned_at?: DateTimeNullableWithAggregatesFilter<"Tasks"> | Date | string | null
    modified_at?: DateTimeNullableWithAggregatesFilter<"Tasks"> | Date | string | null
    modified_by?: StringNullableWithAggregatesFilter<"Tasks"> | string | null
  }

  export type LabelsCreateInput = {
    id: string
    name: string
    color?: string | null
    project_id: string
  }

  export type LabelsUncheckedCreateInput = {
    id: string
    name: string
    color?: string | null
    project_id: string
  }

  export type LabelsUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    color?: NullableStringFieldUpdateOperationsInput | string | null
    project_id?: StringFieldUpdateOperationsInput | string
  }

  export type LabelsUncheckedUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    color?: NullableStringFieldUpdateOperationsInput | string | null
    project_id?: StringFieldUpdateOperationsInput | string
  }

  export type LabelsCreateManyInput = {
    id: string
    name: string
    color?: string | null
    project_id: string
  }

  export type LabelsUpdateManyMutationInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    color?: NullableStringFieldUpdateOperationsInput | string | null
    project_id?: StringFieldUpdateOperationsInput | string
  }

  export type LabelsUncheckedUpdateManyInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    color?: NullableStringFieldUpdateOperationsInput | string | null
    project_id?: StringFieldUpdateOperationsInput | string
  }

  export type TasksCreateInput = {
    id: string
    slug: string
    markdown?: string | null
    summary: string
    type: string
    impact?: number | null
    sort_order?: number | null
    status: number
    project_id: string
    created_at: Date | string
    created_by: string
    assigned_by?: string | null
    assigned_at?: Date | string | null
    modified_at?: Date | string | null
    modified_by?: string | null
  }

  export type TasksUncheckedCreateInput = {
    id: string
    slug: string
    markdown?: string | null
    summary: string
    type: string
    impact?: number | null
    sort_order?: number | null
    status: number
    project_id: string
    created_at: Date | string
    created_by: string
    assigned_by?: string | null
    assigned_at?: Date | string | null
    modified_at?: Date | string | null
    modified_by?: string | null
  }

  export type TasksUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    slug?: StringFieldUpdateOperationsInput | string
    markdown?: NullableStringFieldUpdateOperationsInput | string | null
    summary?: StringFieldUpdateOperationsInput | string
    type?: StringFieldUpdateOperationsInput | string
    impact?: NullableIntFieldUpdateOperationsInput | number | null
    sort_order?: NullableIntFieldUpdateOperationsInput | number | null
    status?: IntFieldUpdateOperationsInput | number
    project_id?: StringFieldUpdateOperationsInput | string
    created_at?: DateTimeFieldUpdateOperationsInput | Date | string
    created_by?: StringFieldUpdateOperationsInput | string
    assigned_by?: NullableStringFieldUpdateOperationsInput | string | null
    assigned_at?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    modified_at?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    modified_by?: NullableStringFieldUpdateOperationsInput | string | null
  }

  export type TasksUncheckedUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    slug?: StringFieldUpdateOperationsInput | string
    markdown?: NullableStringFieldUpdateOperationsInput | string | null
    summary?: StringFieldUpdateOperationsInput | string
    type?: StringFieldUpdateOperationsInput | string
    impact?: NullableIntFieldUpdateOperationsInput | number | null
    sort_order?: NullableIntFieldUpdateOperationsInput | number | null
    status?: IntFieldUpdateOperationsInput | number
    project_id?: StringFieldUpdateOperationsInput | string
    created_at?: DateTimeFieldUpdateOperationsInput | Date | string
    created_by?: StringFieldUpdateOperationsInput | string
    assigned_by?: NullableStringFieldUpdateOperationsInput | string | null
    assigned_at?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    modified_at?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    modified_by?: NullableStringFieldUpdateOperationsInput | string | null
  }

  export type TasksCreateManyInput = {
    id: string
    slug: string
    markdown?: string | null
    summary: string
    type: string
    impact?: number | null
    sort_order?: number | null
    status: number
    project_id: string
    created_at: Date | string
    created_by: string
    assigned_by?: string | null
    assigned_at?: Date | string | null
    modified_at?: Date | string | null
    modified_by?: string | null
  }

  export type TasksUpdateManyMutationInput = {
    id?: StringFieldUpdateOperationsInput | string
    slug?: StringFieldUpdateOperationsInput | string
    markdown?: NullableStringFieldUpdateOperationsInput | string | null
    summary?: StringFieldUpdateOperationsInput | string
    type?: StringFieldUpdateOperationsInput | string
    impact?: NullableIntFieldUpdateOperationsInput | number | null
    sort_order?: NullableIntFieldUpdateOperationsInput | number | null
    status?: IntFieldUpdateOperationsInput | number
    project_id?: StringFieldUpdateOperationsInput | string
    created_at?: DateTimeFieldUpdateOperationsInput | Date | string
    created_by?: StringFieldUpdateOperationsInput | string
    assigned_by?: NullableStringFieldUpdateOperationsInput | string | null
    assigned_at?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    modified_at?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    modified_by?: NullableStringFieldUpdateOperationsInput | string | null
  }

  export type TasksUncheckedUpdateManyInput = {
    id?: StringFieldUpdateOperationsInput | string
    slug?: StringFieldUpdateOperationsInput | string
    markdown?: NullableStringFieldUpdateOperationsInput | string | null
    summary?: StringFieldUpdateOperationsInput | string
    type?: StringFieldUpdateOperationsInput | string
    impact?: NullableIntFieldUpdateOperationsInput | number | null
    sort_order?: NullableIntFieldUpdateOperationsInput | number | null
    status?: IntFieldUpdateOperationsInput | number
    project_id?: StringFieldUpdateOperationsInput | string
    created_at?: DateTimeFieldUpdateOperationsInput | Date | string
    created_by?: StringFieldUpdateOperationsInput | string
    assigned_by?: NullableStringFieldUpdateOperationsInput | string | null
    assigned_at?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    modified_at?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    modified_by?: NullableStringFieldUpdateOperationsInput | string | null
  }

  export type StringFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel>
    in?: Enumerable<string> | ListStringFieldRefInput<$PrismaModel>
    notIn?: Enumerable<string> | ListStringFieldRefInput<$PrismaModel>
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    mode?: QueryMode
    not?: NestedStringFilter<$PrismaModel> | string
  }

  export type StringNullableFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel> | null
    in?: Enumerable<string> | ListStringFieldRefInput<$PrismaModel> | null
    notIn?: Enumerable<string> | ListStringFieldRefInput<$PrismaModel> | null
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    mode?: QueryMode
    not?: NestedStringNullableFilter<$PrismaModel> | string | null
  }

  export type SortOrderInput = {
    sort: SortOrder
    nulls?: NullsOrder
  }

  export type LabelsCountOrderByAggregateInput = {
    id?: SortOrder
    name?: SortOrder
    color?: SortOrder
    project_id?: SortOrder
  }

  export type LabelsMaxOrderByAggregateInput = {
    id?: SortOrder
    name?: SortOrder
    color?: SortOrder
    project_id?: SortOrder
  }

  export type LabelsMinOrderByAggregateInput = {
    id?: SortOrder
    name?: SortOrder
    color?: SortOrder
    project_id?: SortOrder
  }

  export type StringWithAggregatesFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel>
    in?: Enumerable<string> | ListStringFieldRefInput<$PrismaModel>
    notIn?: Enumerable<string> | ListStringFieldRefInput<$PrismaModel>
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    mode?: QueryMode
    not?: NestedStringWithAggregatesFilter<$PrismaModel> | string
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedStringFilter<$PrismaModel>
    _max?: NestedStringFilter<$PrismaModel>
  }

  export type StringNullableWithAggregatesFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel> | null
    in?: Enumerable<string> | ListStringFieldRefInput<$PrismaModel> | null
    notIn?: Enumerable<string> | ListStringFieldRefInput<$PrismaModel> | null
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    mode?: QueryMode
    not?: NestedStringNullableWithAggregatesFilter<$PrismaModel> | string | null
    _count?: NestedIntNullableFilter<$PrismaModel>
    _min?: NestedStringNullableFilter<$PrismaModel>
    _max?: NestedStringNullableFilter<$PrismaModel>
  }

  export type IntNullableFilter<$PrismaModel = never> = {
    equals?: number | IntFieldRefInput<$PrismaModel> | null
    in?: Enumerable<number> | ListIntFieldRefInput<$PrismaModel> | null
    notIn?: Enumerable<number> | ListIntFieldRefInput<$PrismaModel> | null
    lt?: number | IntFieldRefInput<$PrismaModel>
    lte?: number | IntFieldRefInput<$PrismaModel>
    gt?: number | IntFieldRefInput<$PrismaModel>
    gte?: number | IntFieldRefInput<$PrismaModel>
    not?: NestedIntNullableFilter<$PrismaModel> | number | null
  }

  export type IntFilter<$PrismaModel = never> = {
    equals?: number | IntFieldRefInput<$PrismaModel>
    in?: Enumerable<number> | ListIntFieldRefInput<$PrismaModel>
    notIn?: Enumerable<number> | ListIntFieldRefInput<$PrismaModel>
    lt?: number | IntFieldRefInput<$PrismaModel>
    lte?: number | IntFieldRefInput<$PrismaModel>
    gt?: number | IntFieldRefInput<$PrismaModel>
    gte?: number | IntFieldRefInput<$PrismaModel>
    not?: NestedIntFilter<$PrismaModel> | number
  }

  export type DateTimeFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    in?: Enumerable<Date> | Enumerable<string> | ListDateTimeFieldRefInput<$PrismaModel>
    notIn?: Enumerable<Date> | Enumerable<string> | ListDateTimeFieldRefInput<$PrismaModel>
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    not?: NestedDateTimeFilter<$PrismaModel> | Date | string
  }

  export type DateTimeNullableFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel> | null
    in?: Enumerable<Date> | Enumerable<string> | ListDateTimeFieldRefInput<$PrismaModel> | null
    notIn?: Enumerable<Date> | Enumerable<string> | ListDateTimeFieldRefInput<$PrismaModel> | null
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    not?: NestedDateTimeNullableFilter<$PrismaModel> | Date | string | null
  }

  export type TasksCountOrderByAggregateInput = {
    id?: SortOrder
    slug?: SortOrder
    markdown?: SortOrder
    summary?: SortOrder
    type?: SortOrder
    impact?: SortOrder
    sort_order?: SortOrder
    status?: SortOrder
    project_id?: SortOrder
    created_at?: SortOrder
    created_by?: SortOrder
    assigned_by?: SortOrder
    assigned_at?: SortOrder
    modified_at?: SortOrder
    modified_by?: SortOrder
  }

  export type TasksAvgOrderByAggregateInput = {
    impact?: SortOrder
    sort_order?: SortOrder
    status?: SortOrder
  }

  export type TasksMaxOrderByAggregateInput = {
    id?: SortOrder
    slug?: SortOrder
    markdown?: SortOrder
    summary?: SortOrder
    type?: SortOrder
    impact?: SortOrder
    sort_order?: SortOrder
    status?: SortOrder
    project_id?: SortOrder
    created_at?: SortOrder
    created_by?: SortOrder
    assigned_by?: SortOrder
    assigned_at?: SortOrder
    modified_at?: SortOrder
    modified_by?: SortOrder
  }

  export type TasksMinOrderByAggregateInput = {
    id?: SortOrder
    slug?: SortOrder
    markdown?: SortOrder
    summary?: SortOrder
    type?: SortOrder
    impact?: SortOrder
    sort_order?: SortOrder
    status?: SortOrder
    project_id?: SortOrder
    created_at?: SortOrder
    created_by?: SortOrder
    assigned_by?: SortOrder
    assigned_at?: SortOrder
    modified_at?: SortOrder
    modified_by?: SortOrder
  }

  export type TasksSumOrderByAggregateInput = {
    impact?: SortOrder
    sort_order?: SortOrder
    status?: SortOrder
  }

  export type IntNullableWithAggregatesFilter<$PrismaModel = never> = {
    equals?: number | IntFieldRefInput<$PrismaModel> | null
    in?: Enumerable<number> | ListIntFieldRefInput<$PrismaModel> | null
    notIn?: Enumerable<number> | ListIntFieldRefInput<$PrismaModel> | null
    lt?: number | IntFieldRefInput<$PrismaModel>
    lte?: number | IntFieldRefInput<$PrismaModel>
    gt?: number | IntFieldRefInput<$PrismaModel>
    gte?: number | IntFieldRefInput<$PrismaModel>
    not?: NestedIntNullableWithAggregatesFilter<$PrismaModel> | number | null
    _count?: NestedIntNullableFilter<$PrismaModel>
    _avg?: NestedFloatNullableFilter<$PrismaModel>
    _sum?: NestedIntNullableFilter<$PrismaModel>
    _min?: NestedIntNullableFilter<$PrismaModel>
    _max?: NestedIntNullableFilter<$PrismaModel>
  }

  export type IntWithAggregatesFilter<$PrismaModel = never> = {
    equals?: number | IntFieldRefInput<$PrismaModel>
    in?: Enumerable<number> | ListIntFieldRefInput<$PrismaModel>
    notIn?: Enumerable<number> | ListIntFieldRefInput<$PrismaModel>
    lt?: number | IntFieldRefInput<$PrismaModel>
    lte?: number | IntFieldRefInput<$PrismaModel>
    gt?: number | IntFieldRefInput<$PrismaModel>
    gte?: number | IntFieldRefInput<$PrismaModel>
    not?: NestedIntWithAggregatesFilter<$PrismaModel> | number
    _count?: NestedIntFilter<$PrismaModel>
    _avg?: NestedFloatFilter<$PrismaModel>
    _sum?: NestedIntFilter<$PrismaModel>
    _min?: NestedIntFilter<$PrismaModel>
    _max?: NestedIntFilter<$PrismaModel>
  }

  export type DateTimeWithAggregatesFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    in?: Enumerable<Date> | Enumerable<string> | ListDateTimeFieldRefInput<$PrismaModel>
    notIn?: Enumerable<Date> | Enumerable<string> | ListDateTimeFieldRefInput<$PrismaModel>
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    not?: NestedDateTimeWithAggregatesFilter<$PrismaModel> | Date | string
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedDateTimeFilter<$PrismaModel>
    _max?: NestedDateTimeFilter<$PrismaModel>
  }

  export type DateTimeNullableWithAggregatesFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel> | null
    in?: Enumerable<Date> | Enumerable<string> | ListDateTimeFieldRefInput<$PrismaModel> | null
    notIn?: Enumerable<Date> | Enumerable<string> | ListDateTimeFieldRefInput<$PrismaModel> | null
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    not?: NestedDateTimeNullableWithAggregatesFilter<$PrismaModel> | Date | string | null
    _count?: NestedIntNullableFilter<$PrismaModel>
    _min?: NestedDateTimeNullableFilter<$PrismaModel>
    _max?: NestedDateTimeNullableFilter<$PrismaModel>
  }

  export type StringFieldUpdateOperationsInput = {
    set?: string
  }

  export type NullableStringFieldUpdateOperationsInput = {
    set?: string | null
  }

  export type NullableIntFieldUpdateOperationsInput = {
    set?: number | null
    increment?: number
    decrement?: number
    multiply?: number
    divide?: number
  }

  export type IntFieldUpdateOperationsInput = {
    set?: number
    increment?: number
    decrement?: number
    multiply?: number
    divide?: number
  }

  export type DateTimeFieldUpdateOperationsInput = {
    set?: Date | string
  }

  export type NullableDateTimeFieldUpdateOperationsInput = {
    set?: Date | string | null
  }

  export type NestedStringFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel>
    in?: Enumerable<string> | ListStringFieldRefInput<$PrismaModel>
    notIn?: Enumerable<string> | ListStringFieldRefInput<$PrismaModel>
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    not?: NestedStringFilter<$PrismaModel> | string
  }

  export type NestedStringNullableFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel> | null
    in?: Enumerable<string> | ListStringFieldRefInput<$PrismaModel> | null
    notIn?: Enumerable<string> | ListStringFieldRefInput<$PrismaModel> | null
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    not?: NestedStringNullableFilter<$PrismaModel> | string | null
  }

  export type NestedStringWithAggregatesFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel>
    in?: Enumerable<string> | ListStringFieldRefInput<$PrismaModel>
    notIn?: Enumerable<string> | ListStringFieldRefInput<$PrismaModel>
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    not?: NestedStringWithAggregatesFilter<$PrismaModel> | string
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedStringFilter<$PrismaModel>
    _max?: NestedStringFilter<$PrismaModel>
  }

  export type NestedIntFilter<$PrismaModel = never> = {
    equals?: number | IntFieldRefInput<$PrismaModel>
    in?: Enumerable<number> | ListIntFieldRefInput<$PrismaModel>
    notIn?: Enumerable<number> | ListIntFieldRefInput<$PrismaModel>
    lt?: number | IntFieldRefInput<$PrismaModel>
    lte?: number | IntFieldRefInput<$PrismaModel>
    gt?: number | IntFieldRefInput<$PrismaModel>
    gte?: number | IntFieldRefInput<$PrismaModel>
    not?: NestedIntFilter<$PrismaModel> | number
  }

  export type NestedStringNullableWithAggregatesFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel> | null
    in?: Enumerable<string> | ListStringFieldRefInput<$PrismaModel> | null
    notIn?: Enumerable<string> | ListStringFieldRefInput<$PrismaModel> | null
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    not?: NestedStringNullableWithAggregatesFilter<$PrismaModel> | string | null
    _count?: NestedIntNullableFilter<$PrismaModel>
    _min?: NestedStringNullableFilter<$PrismaModel>
    _max?: NestedStringNullableFilter<$PrismaModel>
  }

  export type NestedIntNullableFilter<$PrismaModel = never> = {
    equals?: number | IntFieldRefInput<$PrismaModel> | null
    in?: Enumerable<number> | ListIntFieldRefInput<$PrismaModel> | null
    notIn?: Enumerable<number> | ListIntFieldRefInput<$PrismaModel> | null
    lt?: number | IntFieldRefInput<$PrismaModel>
    lte?: number | IntFieldRefInput<$PrismaModel>
    gt?: number | IntFieldRefInput<$PrismaModel>
    gte?: number | IntFieldRefInput<$PrismaModel>
    not?: NestedIntNullableFilter<$PrismaModel> | number | null
  }

  export type NestedDateTimeFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    in?: Enumerable<Date> | Enumerable<string> | ListDateTimeFieldRefInput<$PrismaModel>
    notIn?: Enumerable<Date> | Enumerable<string> | ListDateTimeFieldRefInput<$PrismaModel>
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    not?: NestedDateTimeFilter<$PrismaModel> | Date | string
  }

  export type NestedDateTimeNullableFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel> | null
    in?: Enumerable<Date> | Enumerable<string> | ListDateTimeFieldRefInput<$PrismaModel> | null
    notIn?: Enumerable<Date> | Enumerable<string> | ListDateTimeFieldRefInput<$PrismaModel> | null
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    not?: NestedDateTimeNullableFilter<$PrismaModel> | Date | string | null
  }

  export type NestedIntNullableWithAggregatesFilter<$PrismaModel = never> = {
    equals?: number | IntFieldRefInput<$PrismaModel> | null
    in?: Enumerable<number> | ListIntFieldRefInput<$PrismaModel> | null
    notIn?: Enumerable<number> | ListIntFieldRefInput<$PrismaModel> | null
    lt?: number | IntFieldRefInput<$PrismaModel>
    lte?: number | IntFieldRefInput<$PrismaModel>
    gt?: number | IntFieldRefInput<$PrismaModel>
    gte?: number | IntFieldRefInput<$PrismaModel>
    not?: NestedIntNullableWithAggregatesFilter<$PrismaModel> | number | null
    _count?: NestedIntNullableFilter<$PrismaModel>
    _avg?: NestedFloatNullableFilter<$PrismaModel>
    _sum?: NestedIntNullableFilter<$PrismaModel>
    _min?: NestedIntNullableFilter<$PrismaModel>
    _max?: NestedIntNullableFilter<$PrismaModel>
  }

  export type NestedFloatNullableFilter<$PrismaModel = never> = {
    equals?: number | FloatFieldRefInput<$PrismaModel> | null
    in?: Enumerable<number> | ListFloatFieldRefInput<$PrismaModel> | null
    notIn?: Enumerable<number> | ListFloatFieldRefInput<$PrismaModel> | null
    lt?: number | FloatFieldRefInput<$PrismaModel>
    lte?: number | FloatFieldRefInput<$PrismaModel>
    gt?: number | FloatFieldRefInput<$PrismaModel>
    gte?: number | FloatFieldRefInput<$PrismaModel>
    not?: NestedFloatNullableFilter<$PrismaModel> | number | null
  }

  export type NestedIntWithAggregatesFilter<$PrismaModel = never> = {
    equals?: number | IntFieldRefInput<$PrismaModel>
    in?: Enumerable<number> | ListIntFieldRefInput<$PrismaModel>
    notIn?: Enumerable<number> | ListIntFieldRefInput<$PrismaModel>
    lt?: number | IntFieldRefInput<$PrismaModel>
    lte?: number | IntFieldRefInput<$PrismaModel>
    gt?: number | IntFieldRefInput<$PrismaModel>
    gte?: number | IntFieldRefInput<$PrismaModel>
    not?: NestedIntWithAggregatesFilter<$PrismaModel> | number
    _count?: NestedIntFilter<$PrismaModel>
    _avg?: NestedFloatFilter<$PrismaModel>
    _sum?: NestedIntFilter<$PrismaModel>
    _min?: NestedIntFilter<$PrismaModel>
    _max?: NestedIntFilter<$PrismaModel>
  }

  export type NestedFloatFilter<$PrismaModel = never> = {
    equals?: number | FloatFieldRefInput<$PrismaModel>
    in?: Enumerable<number> | ListFloatFieldRefInput<$PrismaModel>
    notIn?: Enumerable<number> | ListFloatFieldRefInput<$PrismaModel>
    lt?: number | FloatFieldRefInput<$PrismaModel>
    lte?: number | FloatFieldRefInput<$PrismaModel>
    gt?: number | FloatFieldRefInput<$PrismaModel>
    gte?: number | FloatFieldRefInput<$PrismaModel>
    not?: NestedFloatFilter<$PrismaModel> | number
  }

  export type NestedDateTimeWithAggregatesFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    in?: Enumerable<Date> | Enumerable<string> | ListDateTimeFieldRefInput<$PrismaModel>
    notIn?: Enumerable<Date> | Enumerable<string> | ListDateTimeFieldRefInput<$PrismaModel>
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    not?: NestedDateTimeWithAggregatesFilter<$PrismaModel> | Date | string
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedDateTimeFilter<$PrismaModel>
    _max?: NestedDateTimeFilter<$PrismaModel>
  }

  export type NestedDateTimeNullableWithAggregatesFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel> | null
    in?: Enumerable<Date> | Enumerable<string> | ListDateTimeFieldRefInput<$PrismaModel> | null
    notIn?: Enumerable<Date> | Enumerable<string> | ListDateTimeFieldRefInput<$PrismaModel> | null
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    not?: NestedDateTimeNullableWithAggregatesFilter<$PrismaModel> | Date | string | null
    _count?: NestedIntNullableFilter<$PrismaModel>
    _min?: NestedDateTimeNullableFilter<$PrismaModel>
    _max?: NestedDateTimeNullableFilter<$PrismaModel>
  }



  /**
   * Batch Payload for updateMany & deleteMany & createMany
   */

  export type BatchPayload = {
    count: number
  }

  /**
   * DMMF
   */
  export const dmmf: runtime.BaseDMMF
}

type Buffer = Omit<Uint8Array, 'set'>
