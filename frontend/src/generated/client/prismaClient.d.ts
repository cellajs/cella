
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
 * Model Projects
 * 
 */
export type Projects = {
  id: string
  organization_id: string
  name: string
  description: string | null
  created_at: Date
  created_by: string
  modified_at: Date | null
  modified_by: string | null
}

/**
 * Model Tasks
 * 
 */
export type Tasks = {
  id: string
  project_id: string
  name: string
  description: string | null
  created_at: Date
  created_by: string
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
 * // Fetch zero or more Projects
 * const projects = await prisma.projects.findMany()
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
   * // Fetch zero or more Projects
   * const projects = await prisma.projects.findMany()
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
   * `prisma.projects`: Exposes CRUD operations for the **Projects** model.
    * Example usage:
    * ```ts
    * // Fetch zero or more Projects
    * const projects = await prisma.projects.findMany()
    * ```
    */
  get projects(): Prisma.ProjectsDelegate<GlobalReject>;

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
   * Query Engine version: d6e67a83f971b175a593ccc12e15c4a757f93ffe
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
    Projects: 'Projects',
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
   * Count Type ProjectsCountOutputType
   */


  export type ProjectsCountOutputType = {
    tasks: number
  }

  export type ProjectsCountOutputTypeSelect = {
    tasks?: boolean
  }

  export type ProjectsCountOutputTypeGetPayload<S extends boolean | null | undefined | ProjectsCountOutputTypeArgs> =
    S extends { select: any, include: any } ? 'Please either choose `select` or `include`' :
    S extends true ? ProjectsCountOutputType :
    S extends undefined ? never :
    S extends { include: any } & (ProjectsCountOutputTypeArgs)
    ? ProjectsCountOutputType 
    : S extends { select: any } & (ProjectsCountOutputTypeArgs)
      ? {
    [P in TruthyKeys<S['select']>]:
    P extends keyof ProjectsCountOutputType ? ProjectsCountOutputType[P] : never
  } 
      : ProjectsCountOutputType




  // Custom InputTypes

  /**
   * ProjectsCountOutputType without action
   */
  export type ProjectsCountOutputTypeArgs = {
    /**
     * Select specific fields to fetch from the ProjectsCountOutputType
     * 
    **/
    select?: ProjectsCountOutputTypeSelect | null
  }



  /**
   * Models
   */

  /**
   * Model Projects
   */


  export type AggregateProjects = {
    _count: ProjectsCountAggregateOutputType | null
    _min: ProjectsMinAggregateOutputType | null
    _max: ProjectsMaxAggregateOutputType | null
  }

  export type ProjectsMinAggregateOutputType = {
    id: string | null
    organization_id: string | null
    name: string | null
    description: string | null
    created_at: Date | null
    created_by: string | null
    modified_at: Date | null
    modified_by: string | null
  }

  export type ProjectsMaxAggregateOutputType = {
    id: string | null
    organization_id: string | null
    name: string | null
    description: string | null
    created_at: Date | null
    created_by: string | null
    modified_at: Date | null
    modified_by: string | null
  }

  export type ProjectsCountAggregateOutputType = {
    id: number
    organization_id: number
    name: number
    description: number
    created_at: number
    created_by: number
    modified_at: number
    modified_by: number
    _all: number
  }


  export type ProjectsMinAggregateInputType = {
    id?: true
    organization_id?: true
    name?: true
    description?: true
    created_at?: true
    created_by?: true
    modified_at?: true
    modified_by?: true
  }

  export type ProjectsMaxAggregateInputType = {
    id?: true
    organization_id?: true
    name?: true
    description?: true
    created_at?: true
    created_by?: true
    modified_at?: true
    modified_by?: true
  }

  export type ProjectsCountAggregateInputType = {
    id?: true
    organization_id?: true
    name?: true
    description?: true
    created_at?: true
    created_by?: true
    modified_at?: true
    modified_by?: true
    _all?: true
  }

  export type ProjectsAggregateArgs = {
    /**
     * Filter which Projects to aggregate.
     * 
    **/
    where?: ProjectsWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Projects to fetch.
     * 
    **/
    orderBy?: Enumerable<ProjectsOrderByWithRelationInput>
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the start position
     * 
    **/
    cursor?: ProjectsWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Projects from the position of the cursor.
     * 
    **/
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Projects.
     * 
    **/
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Count returned Projects
    **/
    _count?: true | ProjectsCountAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the minimum value
    **/
    _min?: ProjectsMinAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the maximum value
    **/
    _max?: ProjectsMaxAggregateInputType
  }

  export type GetProjectsAggregateType<T extends ProjectsAggregateArgs> = {
        [P in keyof T & keyof AggregateProjects]: P extends '_count' | 'count'
      ? T[P] extends true
        ? number
        : GetScalarType<T[P], AggregateProjects[P]>
      : GetScalarType<T[P], AggregateProjects[P]>
  }




  export type ProjectsGroupByArgs = {
    where?: ProjectsWhereInput
    orderBy?: Enumerable<ProjectsOrderByWithAggregationInput>
    by: Array<ProjectsScalarFieldEnum>
    having?: ProjectsScalarWhereWithAggregatesInput
    take?: number
    skip?: number
    _count?: ProjectsCountAggregateInputType | true
    _min?: ProjectsMinAggregateInputType
    _max?: ProjectsMaxAggregateInputType
  }


  export type ProjectsGroupByOutputType = {
    id: string
    organization_id: string
    name: string
    description: string | null
    created_at: Date
    created_by: string
    modified_at: Date | null
    modified_by: string | null
    _count: ProjectsCountAggregateOutputType | null
    _min: ProjectsMinAggregateOutputType | null
    _max: ProjectsMaxAggregateOutputType | null
  }

  type GetProjectsGroupByPayload<T extends ProjectsGroupByArgs> = PrismaPromise<
    Array<
      PickArray<ProjectsGroupByOutputType, T['by']> &
        {
          [P in ((keyof T) & (keyof ProjectsGroupByOutputType))]: P extends '_count'
            ? T[P] extends boolean
              ? number
              : GetScalarType<T[P], ProjectsGroupByOutputType[P]>
            : GetScalarType<T[P], ProjectsGroupByOutputType[P]>
        }
      >
    >


  export type ProjectsSelect = {
    id?: boolean
    organization_id?: boolean
    name?: boolean
    description?: boolean
    created_at?: boolean
    created_by?: boolean
    modified_at?: boolean
    modified_by?: boolean
    tasks?: boolean | Projects$tasksArgs
    _count?: boolean | ProjectsCountOutputTypeArgs
  }


  export type ProjectsInclude = {
    tasks?: boolean | Projects$tasksArgs
    _count?: boolean | ProjectsCountOutputTypeArgs
  } 

  export type ProjectsGetPayload<S extends boolean | null | undefined | ProjectsArgs> =
    S extends { select: any, include: any } ? 'Please either choose `select` or `include`' :
    S extends true ? Projects :
    S extends undefined ? never :
    S extends { include: any } & (ProjectsArgs | ProjectsFindManyArgs)
    ? Projects  & {
    [P in TruthyKeys<S['include']>]:
        P extends 'tasks' ? Array < TasksGetPayload<S['include'][P]>>  :
        P extends '_count' ? ProjectsCountOutputTypeGetPayload<S['include'][P]> :  never
  } 
    : S extends { select: any } & (ProjectsArgs | ProjectsFindManyArgs)
      ? {
    [P in TruthyKeys<S['select']>]:
        P extends 'tasks' ? Array < TasksGetPayload<S['select'][P]>>  :
        P extends '_count' ? ProjectsCountOutputTypeGetPayload<S['select'][P]> :  P extends keyof Projects ? Projects[P] : never
  } 
      : Projects


  type ProjectsCountArgs = Merge<
    Omit<ProjectsFindManyArgs, 'select' | 'include'> & {
      select?: ProjectsCountAggregateInputType | true
    }
  >

  export interface ProjectsDelegate<GlobalRejectSettings extends Prisma.RejectOnNotFound | Prisma.RejectPerOperation | false | undefined> {
    /**
     * Find zero or one Projects that matches the filter.
     * @param {ProjectsFindUniqueArgs} args - Arguments to find a Projects
     * @example
     * // Get one Projects
     * const projects = await prisma.projects.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
    **/
    findUnique<T extends ProjectsFindUniqueArgs,  LocalRejectSettings = T["rejectOnNotFound"] extends RejectOnNotFound ? T['rejectOnNotFound'] : undefined>(
      args: SelectSubset<T, ProjectsFindUniqueArgs>
    ): HasReject<GlobalRejectSettings, LocalRejectSettings, 'findUnique', 'Projects'> extends True ? Prisma__ProjectsClient<ProjectsGetPayload<T>> : Prisma__ProjectsClient<ProjectsGetPayload<T> | null, null>

    /**
     * Find one Projects that matches the filter or throw an error  with `error.code='P2025'` 
     *     if no matches were found.
     * @param {ProjectsFindUniqueOrThrowArgs} args - Arguments to find a Projects
     * @example
     * // Get one Projects
     * const projects = await prisma.projects.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
    **/
    findUniqueOrThrow<T extends ProjectsFindUniqueOrThrowArgs>(
      args?: SelectSubset<T, ProjectsFindUniqueOrThrowArgs>
    ): Prisma__ProjectsClient<ProjectsGetPayload<T>>

    /**
     * Find the first Projects that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ProjectsFindFirstArgs} args - Arguments to find a Projects
     * @example
     * // Get one Projects
     * const projects = await prisma.projects.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
    **/
    findFirst<T extends ProjectsFindFirstArgs,  LocalRejectSettings = T["rejectOnNotFound"] extends RejectOnNotFound ? T['rejectOnNotFound'] : undefined>(
      args?: SelectSubset<T, ProjectsFindFirstArgs>
    ): HasReject<GlobalRejectSettings, LocalRejectSettings, 'findFirst', 'Projects'> extends True ? Prisma__ProjectsClient<ProjectsGetPayload<T>> : Prisma__ProjectsClient<ProjectsGetPayload<T> | null, null>

    /**
     * Find the first Projects that matches the filter or
     * throw `NotFoundError` if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ProjectsFindFirstOrThrowArgs} args - Arguments to find a Projects
     * @example
     * // Get one Projects
     * const projects = await prisma.projects.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
    **/
    findFirstOrThrow<T extends ProjectsFindFirstOrThrowArgs>(
      args?: SelectSubset<T, ProjectsFindFirstOrThrowArgs>
    ): Prisma__ProjectsClient<ProjectsGetPayload<T>>

    /**
     * Find zero or more Projects that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ProjectsFindManyArgs=} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all Projects
     * const projects = await prisma.projects.findMany()
     * 
     * // Get first 10 Projects
     * const projects = await prisma.projects.findMany({ take: 10 })
     * 
     * // Only select the `id`
     * const projectsWithIdOnly = await prisma.projects.findMany({ select: { id: true } })
     * 
    **/
    findMany<T extends ProjectsFindManyArgs>(
      args?: SelectSubset<T, ProjectsFindManyArgs>
    ): PrismaPromise<Array<ProjectsGetPayload<T>>>

    /**
     * Create a Projects.
     * @param {ProjectsCreateArgs} args - Arguments to create a Projects.
     * @example
     * // Create one Projects
     * const Projects = await prisma.projects.create({
     *   data: {
     *     // ... data to create a Projects
     *   }
     * })
     * 
    **/
    create<T extends ProjectsCreateArgs>(
      args: SelectSubset<T, ProjectsCreateArgs>
    ): Prisma__ProjectsClient<ProjectsGetPayload<T>>

    /**
     * Create many Projects.
     *     @param {ProjectsCreateManyArgs} args - Arguments to create many Projects.
     *     @example
     *     // Create many Projects
     *     const projects = await prisma.projects.createMany({
     *       data: {
     *         // ... provide data here
     *       }
     *     })
     *     
    **/
    createMany<T extends ProjectsCreateManyArgs>(
      args?: SelectSubset<T, ProjectsCreateManyArgs>
    ): PrismaPromise<BatchPayload>

    /**
     * Delete a Projects.
     * @param {ProjectsDeleteArgs} args - Arguments to delete one Projects.
     * @example
     * // Delete one Projects
     * const Projects = await prisma.projects.delete({
     *   where: {
     *     // ... filter to delete one Projects
     *   }
     * })
     * 
    **/
    delete<T extends ProjectsDeleteArgs>(
      args: SelectSubset<T, ProjectsDeleteArgs>
    ): Prisma__ProjectsClient<ProjectsGetPayload<T>>

    /**
     * Update one Projects.
     * @param {ProjectsUpdateArgs} args - Arguments to update one Projects.
     * @example
     * // Update one Projects
     * const projects = await prisma.projects.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
    **/
    update<T extends ProjectsUpdateArgs>(
      args: SelectSubset<T, ProjectsUpdateArgs>
    ): Prisma__ProjectsClient<ProjectsGetPayload<T>>

    /**
     * Delete zero or more Projects.
     * @param {ProjectsDeleteManyArgs} args - Arguments to filter Projects to delete.
     * @example
     * // Delete a few Projects
     * const { count } = await prisma.projects.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     * 
    **/
    deleteMany<T extends ProjectsDeleteManyArgs>(
      args?: SelectSubset<T, ProjectsDeleteManyArgs>
    ): PrismaPromise<BatchPayload>

    /**
     * Update zero or more Projects.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ProjectsUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many Projects
     * const projects = await prisma.projects.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
    **/
    updateMany<T extends ProjectsUpdateManyArgs>(
      args: SelectSubset<T, ProjectsUpdateManyArgs>
    ): PrismaPromise<BatchPayload>

    /**
     * Create or update one Projects.
     * @param {ProjectsUpsertArgs} args - Arguments to update or create a Projects.
     * @example
     * // Update or create a Projects
     * const projects = await prisma.projects.upsert({
     *   create: {
     *     // ... data to create a Projects
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the Projects we want to update
     *   }
     * })
    **/
    upsert<T extends ProjectsUpsertArgs>(
      args: SelectSubset<T, ProjectsUpsertArgs>
    ): Prisma__ProjectsClient<ProjectsGetPayload<T>>

    /**
     * Count the number of Projects.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ProjectsCountArgs} args - Arguments to filter Projects to count.
     * @example
     * // Count the number of Projects
     * const count = await prisma.projects.count({
     *   where: {
     *     // ... the filter for the Projects we want to count
     *   }
     * })
    **/
    count<T extends ProjectsCountArgs>(
      args?: Subset<T, ProjectsCountArgs>,
    ): PrismaPromise<
      T extends _Record<'select', any>
        ? T['select'] extends true
          ? number
          : GetScalarType<T['select'], ProjectsCountAggregateOutputType>
        : number
    >

    /**
     * Allows you to perform aggregations operations on a Projects.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ProjectsAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
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
    aggregate<T extends ProjectsAggregateArgs>(args: Subset<T, ProjectsAggregateArgs>): PrismaPromise<GetProjectsAggregateType<T>>

    /**
     * Group by Projects.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ProjectsGroupByArgs} args - Group by arguments.
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
      T extends ProjectsGroupByArgs,
      HasSelectOrTake extends Or<
        Extends<'skip', Keys<T>>,
        Extends<'take', Keys<T>>
      >,
      OrderByArg extends True extends HasSelectOrTake
        ? { orderBy: ProjectsGroupByArgs['orderBy'] }
        : { orderBy?: ProjectsGroupByArgs['orderBy'] },
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
    >(args: SubsetIntersection<T, ProjectsGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetProjectsGroupByPayload<T> : PrismaPromise<InputErrors>

  }

  /**
   * The delegate class that acts as a "Promise-like" for Projects.
   * Why is this prefixed with `Prisma__`?
   * Because we want to prevent naming conflicts as mentioned in
   * https://github.com/prisma/prisma-client-js/issues/707
   */
  export class Prisma__ProjectsClient<T, Null = never> implements PrismaPromise<T> {
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

    tasks<T extends Projects$tasksArgs= {}>(args?: Subset<T, Projects$tasksArgs>): PrismaPromise<Array<TasksGetPayload<T>>| Null>;

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
   * Projects base type for findUnique actions
   */
  export type ProjectsFindUniqueArgsBase = {
    /**
     * Select specific fields to fetch from the Projects
     * 
    **/
    select?: ProjectsSelect | null
    /**
     * Choose, which related nodes to fetch as well.
     * 
    **/
    include?: ProjectsInclude | null
    /**
     * Filter, which Projects to fetch.
     * 
    **/
    where: ProjectsWhereUniqueInput
  }

  /**
   * Projects findUnique
   */
  export interface ProjectsFindUniqueArgs extends ProjectsFindUniqueArgsBase {
   /**
    * Throw an Error if query returns no results
    * @deprecated since 4.0.0: use `findUniqueOrThrow` method instead
    */
    rejectOnNotFound?: RejectOnNotFound
  }
      

  /**
   * Projects findUniqueOrThrow
   */
  export type ProjectsFindUniqueOrThrowArgs = {
    /**
     * Select specific fields to fetch from the Projects
     * 
    **/
    select?: ProjectsSelect | null
    /**
     * Choose, which related nodes to fetch as well.
     * 
    **/
    include?: ProjectsInclude | null
    /**
     * Filter, which Projects to fetch.
     * 
    **/
    where: ProjectsWhereUniqueInput
  }


  /**
   * Projects base type for findFirst actions
   */
  export type ProjectsFindFirstArgsBase = {
    /**
     * Select specific fields to fetch from the Projects
     * 
    **/
    select?: ProjectsSelect | null
    /**
     * Choose, which related nodes to fetch as well.
     * 
    **/
    include?: ProjectsInclude | null
    /**
     * Filter, which Projects to fetch.
     * 
    **/
    where?: ProjectsWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Projects to fetch.
     * 
    **/
    orderBy?: Enumerable<ProjectsOrderByWithRelationInput>
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for Projects.
     * 
    **/
    cursor?: ProjectsWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Projects from the position of the cursor.
     * 
    **/
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Projects.
     * 
    **/
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of Projects.
     * 
    **/
    distinct?: Enumerable<ProjectsScalarFieldEnum>
  }

  /**
   * Projects findFirst
   */
  export interface ProjectsFindFirstArgs extends ProjectsFindFirstArgsBase {
   /**
    * Throw an Error if query returns no results
    * @deprecated since 4.0.0: use `findFirstOrThrow` method instead
    */
    rejectOnNotFound?: RejectOnNotFound
  }
      

  /**
   * Projects findFirstOrThrow
   */
  export type ProjectsFindFirstOrThrowArgs = {
    /**
     * Select specific fields to fetch from the Projects
     * 
    **/
    select?: ProjectsSelect | null
    /**
     * Choose, which related nodes to fetch as well.
     * 
    **/
    include?: ProjectsInclude | null
    /**
     * Filter, which Projects to fetch.
     * 
    **/
    where?: ProjectsWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Projects to fetch.
     * 
    **/
    orderBy?: Enumerable<ProjectsOrderByWithRelationInput>
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for Projects.
     * 
    **/
    cursor?: ProjectsWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Projects from the position of the cursor.
     * 
    **/
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Projects.
     * 
    **/
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of Projects.
     * 
    **/
    distinct?: Enumerable<ProjectsScalarFieldEnum>
  }


  /**
   * Projects findMany
   */
  export type ProjectsFindManyArgs = {
    /**
     * Select specific fields to fetch from the Projects
     * 
    **/
    select?: ProjectsSelect | null
    /**
     * Choose, which related nodes to fetch as well.
     * 
    **/
    include?: ProjectsInclude | null
    /**
     * Filter, which Projects to fetch.
     * 
    **/
    where?: ProjectsWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Projects to fetch.
     * 
    **/
    orderBy?: Enumerable<ProjectsOrderByWithRelationInput>
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for listing Projects.
     * 
    **/
    cursor?: ProjectsWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Projects from the position of the cursor.
     * 
    **/
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Projects.
     * 
    **/
    skip?: number
    distinct?: Enumerable<ProjectsScalarFieldEnum>
  }


  /**
   * Projects create
   */
  export type ProjectsCreateArgs = {
    /**
     * Select specific fields to fetch from the Projects
     * 
    **/
    select?: ProjectsSelect | null
    /**
     * Choose, which related nodes to fetch as well.
     * 
    **/
    include?: ProjectsInclude | null
    /**
     * The data needed to create a Projects.
     * 
    **/
    data: XOR<ProjectsCreateInput, ProjectsUncheckedCreateInput>
  }


  /**
   * Projects createMany
   */
  export type ProjectsCreateManyArgs = {
    /**
     * The data used to create many Projects.
     * 
    **/
    data: Enumerable<ProjectsCreateManyInput>
    skipDuplicates?: boolean
  }


  /**
   * Projects update
   */
  export type ProjectsUpdateArgs = {
    /**
     * Select specific fields to fetch from the Projects
     * 
    **/
    select?: ProjectsSelect | null
    /**
     * Choose, which related nodes to fetch as well.
     * 
    **/
    include?: ProjectsInclude | null
    /**
     * The data needed to update a Projects.
     * 
    **/
    data: XOR<ProjectsUpdateInput, ProjectsUncheckedUpdateInput>
    /**
     * Choose, which Projects to update.
     * 
    **/
    where: ProjectsWhereUniqueInput
  }


  /**
   * Projects updateMany
   */
  export type ProjectsUpdateManyArgs = {
    /**
     * The data used to update Projects.
     * 
    **/
    data: XOR<ProjectsUpdateManyMutationInput, ProjectsUncheckedUpdateManyInput>
    /**
     * Filter which Projects to update
     * 
    **/
    where?: ProjectsWhereInput
  }


  /**
   * Projects upsert
   */
  export type ProjectsUpsertArgs = {
    /**
     * Select specific fields to fetch from the Projects
     * 
    **/
    select?: ProjectsSelect | null
    /**
     * Choose, which related nodes to fetch as well.
     * 
    **/
    include?: ProjectsInclude | null
    /**
     * The filter to search for the Projects to update in case it exists.
     * 
    **/
    where: ProjectsWhereUniqueInput
    /**
     * In case the Projects found by the `where` argument doesn't exist, create a new Projects with this data.
     * 
    **/
    create: XOR<ProjectsCreateInput, ProjectsUncheckedCreateInput>
    /**
     * In case the Projects was found with the provided `where` argument, update it with this data.
     * 
    **/
    update: XOR<ProjectsUpdateInput, ProjectsUncheckedUpdateInput>
  }


  /**
   * Projects delete
   */
  export type ProjectsDeleteArgs = {
    /**
     * Select specific fields to fetch from the Projects
     * 
    **/
    select?: ProjectsSelect | null
    /**
     * Choose, which related nodes to fetch as well.
     * 
    **/
    include?: ProjectsInclude | null
    /**
     * Filter which Projects to delete.
     * 
    **/
    where: ProjectsWhereUniqueInput
  }


  /**
   * Projects deleteMany
   */
  export type ProjectsDeleteManyArgs = {
    /**
     * Filter which Projects to delete
     * 
    **/
    where?: ProjectsWhereInput
  }


  /**
   * Projects.tasks
   */
  export type Projects$tasksArgs = {
    /**
     * Select specific fields to fetch from the Tasks
     * 
    **/
    select?: TasksSelect | null
    /**
     * Choose, which related nodes to fetch as well.
     * 
    **/
    include?: TasksInclude | null
    where?: TasksWhereInput
    orderBy?: Enumerable<TasksOrderByWithRelationInput>
    cursor?: TasksWhereUniqueInput
    take?: number
    skip?: number
    distinct?: Enumerable<TasksScalarFieldEnum>
  }


  /**
   * Projects without action
   */
  export type ProjectsArgs = {
    /**
     * Select specific fields to fetch from the Projects
     * 
    **/
    select?: ProjectsSelect | null
    /**
     * Choose, which related nodes to fetch as well.
     * 
    **/
    include?: ProjectsInclude | null
  }



  /**
   * Model Tasks
   */


  export type AggregateTasks = {
    _count: TasksCountAggregateOutputType | null
    _min: TasksMinAggregateOutputType | null
    _max: TasksMaxAggregateOutputType | null
  }

  export type TasksMinAggregateOutputType = {
    id: string | null
    project_id: string | null
    name: string | null
    description: string | null
    created_at: Date | null
    created_by: string | null
    modified_at: Date | null
    modified_by: string | null
  }

  export type TasksMaxAggregateOutputType = {
    id: string | null
    project_id: string | null
    name: string | null
    description: string | null
    created_at: Date | null
    created_by: string | null
    modified_at: Date | null
    modified_by: string | null
  }

  export type TasksCountAggregateOutputType = {
    id: number
    project_id: number
    name: number
    description: number
    created_at: number
    created_by: number
    modified_at: number
    modified_by: number
    _all: number
  }


  export type TasksMinAggregateInputType = {
    id?: true
    project_id?: true
    name?: true
    description?: true
    created_at?: true
    created_by?: true
    modified_at?: true
    modified_by?: true
  }

  export type TasksMaxAggregateInputType = {
    id?: true
    project_id?: true
    name?: true
    description?: true
    created_at?: true
    created_by?: true
    modified_at?: true
    modified_by?: true
  }

  export type TasksCountAggregateInputType = {
    id?: true
    project_id?: true
    name?: true
    description?: true
    created_at?: true
    created_by?: true
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
    _min?: TasksMinAggregateInputType
    _max?: TasksMaxAggregateInputType
  }


  export type TasksGroupByOutputType = {
    id: string
    project_id: string
    name: string
    description: string | null
    created_at: Date
    created_by: string
    modified_at: Date | null
    modified_by: string | null
    _count: TasksCountAggregateOutputType | null
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
    project_id?: boolean
    name?: boolean
    description?: boolean
    created_at?: boolean
    created_by?: boolean
    modified_at?: boolean
    modified_by?: boolean
    projects?: boolean | ProjectsArgs
  }


  export type TasksInclude = {
    projects?: boolean | ProjectsArgs
  } 

  export type TasksGetPayload<S extends boolean | null | undefined | TasksArgs> =
    S extends { select: any, include: any } ? 'Please either choose `select` or `include`' :
    S extends true ? Tasks :
    S extends undefined ? never :
    S extends { include: any } & (TasksArgs | TasksFindManyArgs)
    ? Tasks  & {
    [P in TruthyKeys<S['include']>]:
        P extends 'projects' ? ProjectsGetPayload<S['include'][P]> :  never
  } 
    : S extends { select: any } & (TasksArgs | TasksFindManyArgs)
      ? {
    [P in TruthyKeys<S['select']>]:
        P extends 'projects' ? ProjectsGetPayload<S['select'][P]> :  P extends keyof Tasks ? Tasks[P] : never
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

    projects<T extends ProjectsArgs= {}>(args?: Subset<T, ProjectsArgs>): Prisma__ProjectsClient<ProjectsGetPayload<T> | Null>;

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
     * Choose, which related nodes to fetch as well.
     * 
    **/
    include?: TasksInclude | null
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
     * Choose, which related nodes to fetch as well.
     * 
    **/
    include?: TasksInclude | null
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
     * Choose, which related nodes to fetch as well.
     * 
    **/
    include?: TasksInclude | null
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
     * Choose, which related nodes to fetch as well.
     * 
    **/
    include?: TasksInclude | null
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
     * Choose, which related nodes to fetch as well.
     * 
    **/
    include?: TasksInclude | null
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
     * Choose, which related nodes to fetch as well.
     * 
    **/
    include?: TasksInclude | null
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
     * Choose, which related nodes to fetch as well.
     * 
    **/
    include?: TasksInclude | null
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
     * Choose, which related nodes to fetch as well.
     * 
    **/
    include?: TasksInclude | null
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
     * Choose, which related nodes to fetch as well.
     * 
    **/
    include?: TasksInclude | null
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
    /**
     * Choose, which related nodes to fetch as well.
     * 
    **/
    include?: TasksInclude | null
  }



  /**
   * Enums
   */

  // Based on
  // https://github.com/microsoft/TypeScript/issues/3192#issuecomment-261720275

  export const ProjectsScalarFieldEnum: {
    id: 'id',
    organization_id: 'organization_id',
    name: 'name',
    description: 'description',
    created_at: 'created_at',
    created_by: 'created_by',
    modified_at: 'modified_at',
    modified_by: 'modified_by'
  };

  export type ProjectsScalarFieldEnum = (typeof ProjectsScalarFieldEnum)[keyof typeof ProjectsScalarFieldEnum]


  export const QueryMode: {
    default: 'default',
    insensitive: 'insensitive'
  };

  export type QueryMode = (typeof QueryMode)[keyof typeof QueryMode]


  export const SortOrder: {
    asc: 'asc',
    desc: 'desc'
  };

  export type SortOrder = (typeof SortOrder)[keyof typeof SortOrder]


  export const TasksScalarFieldEnum: {
    id: 'id',
    project_id: 'project_id',
    name: 'name',
    description: 'description',
    created_at: 'created_at',
    created_by: 'created_by',
    modified_at: 'modified_at',
    modified_by: 'modified_by'
  };

  export type TasksScalarFieldEnum = (typeof TasksScalarFieldEnum)[keyof typeof TasksScalarFieldEnum]


  export const TransactionIsolationLevel: {
    ReadUncommitted: 'ReadUncommitted',
    ReadCommitted: 'ReadCommitted',
    RepeatableRead: 'RepeatableRead',
    Serializable: 'Serializable'
  };

  export type TransactionIsolationLevel = (typeof TransactionIsolationLevel)[keyof typeof TransactionIsolationLevel]


  /**
   * Deep Input Types
   */


  export type ProjectsWhereInput = {
    AND?: Enumerable<ProjectsWhereInput>
    OR?: Enumerable<ProjectsWhereInput>
    NOT?: Enumerable<ProjectsWhereInput>
    id?: StringFilter | string
    organization_id?: StringFilter | string
    name?: StringFilter | string
    description?: StringNullableFilter | string | null
    created_at?: DateTimeFilter | Date | string
    created_by?: StringFilter | string
    modified_at?: DateTimeNullableFilter | Date | string | null
    modified_by?: StringNullableFilter | string | null
    tasks?: TasksListRelationFilter
  }

  export type ProjectsOrderByWithRelationInput = {
    id?: SortOrder
    organization_id?: SortOrder
    name?: SortOrder
    description?: SortOrder
    created_at?: SortOrder
    created_by?: SortOrder
    modified_at?: SortOrder
    modified_by?: SortOrder
    tasks?: TasksOrderByRelationAggregateInput
  }

  export type ProjectsWhereUniqueInput = {
    id?: string
  }

  export type ProjectsOrderByWithAggregationInput = {
    id?: SortOrder
    organization_id?: SortOrder
    name?: SortOrder
    description?: SortOrder
    created_at?: SortOrder
    created_by?: SortOrder
    modified_at?: SortOrder
    modified_by?: SortOrder
    _count?: ProjectsCountOrderByAggregateInput
    _max?: ProjectsMaxOrderByAggregateInput
    _min?: ProjectsMinOrderByAggregateInput
  }

  export type ProjectsScalarWhereWithAggregatesInput = {
    AND?: Enumerable<ProjectsScalarWhereWithAggregatesInput>
    OR?: Enumerable<ProjectsScalarWhereWithAggregatesInput>
    NOT?: Enumerable<ProjectsScalarWhereWithAggregatesInput>
    id?: StringWithAggregatesFilter | string
    organization_id?: StringWithAggregatesFilter | string
    name?: StringWithAggregatesFilter | string
    description?: StringNullableWithAggregatesFilter | string | null
    created_at?: DateTimeWithAggregatesFilter | Date | string
    created_by?: StringWithAggregatesFilter | string
    modified_at?: DateTimeNullableWithAggregatesFilter | Date | string | null
    modified_by?: StringNullableWithAggregatesFilter | string | null
  }

  export type TasksWhereInput = {
    AND?: Enumerable<TasksWhereInput>
    OR?: Enumerable<TasksWhereInput>
    NOT?: Enumerable<TasksWhereInput>
    id?: StringFilter | string
    project_id?: StringFilter | string
    name?: StringFilter | string
    description?: StringNullableFilter | string | null
    created_at?: DateTimeFilter | Date | string
    created_by?: StringFilter | string
    modified_at?: DateTimeNullableFilter | Date | string | null
    modified_by?: StringNullableFilter | string | null
    projects?: XOR<ProjectsRelationFilter, ProjectsWhereInput>
  }

  export type TasksOrderByWithRelationInput = {
    id?: SortOrder
    project_id?: SortOrder
    name?: SortOrder
    description?: SortOrder
    created_at?: SortOrder
    created_by?: SortOrder
    modified_at?: SortOrder
    modified_by?: SortOrder
    projects?: ProjectsOrderByWithRelationInput
  }

  export type TasksWhereUniqueInput = {
    id?: string
  }

  export type TasksOrderByWithAggregationInput = {
    id?: SortOrder
    project_id?: SortOrder
    name?: SortOrder
    description?: SortOrder
    created_at?: SortOrder
    created_by?: SortOrder
    modified_at?: SortOrder
    modified_by?: SortOrder
    _count?: TasksCountOrderByAggregateInput
    _max?: TasksMaxOrderByAggregateInput
    _min?: TasksMinOrderByAggregateInput
  }

  export type TasksScalarWhereWithAggregatesInput = {
    AND?: Enumerable<TasksScalarWhereWithAggregatesInput>
    OR?: Enumerable<TasksScalarWhereWithAggregatesInput>
    NOT?: Enumerable<TasksScalarWhereWithAggregatesInput>
    id?: StringWithAggregatesFilter | string
    project_id?: StringWithAggregatesFilter | string
    name?: StringWithAggregatesFilter | string
    description?: StringNullableWithAggregatesFilter | string | null
    created_at?: DateTimeWithAggregatesFilter | Date | string
    created_by?: StringWithAggregatesFilter | string
    modified_at?: DateTimeNullableWithAggregatesFilter | Date | string | null
    modified_by?: StringNullableWithAggregatesFilter | string | null
  }

  export type ProjectsCreateInput = {
    id: string
    organization_id: string
    name: string
    description?: string | null
    created_at: Date | string
    created_by: string
    modified_at?: Date | string | null
    modified_by?: string | null
    tasks?: TasksCreateNestedManyWithoutProjectsInput
  }

  export type ProjectsUncheckedCreateInput = {
    id: string
    organization_id: string
    name: string
    description?: string | null
    created_at: Date | string
    created_by: string
    modified_at?: Date | string | null
    modified_by?: string | null
    tasks?: TasksUncheckedCreateNestedManyWithoutProjectsInput
  }

  export type ProjectsUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    organization_id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    description?: NullableStringFieldUpdateOperationsInput | string | null
    created_at?: DateTimeFieldUpdateOperationsInput | Date | string
    created_by?: StringFieldUpdateOperationsInput | string
    modified_at?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    modified_by?: NullableStringFieldUpdateOperationsInput | string | null
    tasks?: TasksUpdateManyWithoutProjectsNestedInput
  }

  export type ProjectsUncheckedUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    organization_id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    description?: NullableStringFieldUpdateOperationsInput | string | null
    created_at?: DateTimeFieldUpdateOperationsInput | Date | string
    created_by?: StringFieldUpdateOperationsInput | string
    modified_at?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    modified_by?: NullableStringFieldUpdateOperationsInput | string | null
    tasks?: TasksUncheckedUpdateManyWithoutProjectsNestedInput
  }

  export type ProjectsCreateManyInput = {
    id: string
    organization_id: string
    name: string
    description?: string | null
    created_at: Date | string
    created_by: string
    modified_at?: Date | string | null
    modified_by?: string | null
  }

  export type ProjectsUpdateManyMutationInput = {
    id?: StringFieldUpdateOperationsInput | string
    organization_id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    description?: NullableStringFieldUpdateOperationsInput | string | null
    created_at?: DateTimeFieldUpdateOperationsInput | Date | string
    created_by?: StringFieldUpdateOperationsInput | string
    modified_at?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    modified_by?: NullableStringFieldUpdateOperationsInput | string | null
  }

  export type ProjectsUncheckedUpdateManyInput = {
    id?: StringFieldUpdateOperationsInput | string
    organization_id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    description?: NullableStringFieldUpdateOperationsInput | string | null
    created_at?: DateTimeFieldUpdateOperationsInput | Date | string
    created_by?: StringFieldUpdateOperationsInput | string
    modified_at?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    modified_by?: NullableStringFieldUpdateOperationsInput | string | null
  }

  export type TasksCreateInput = {
    id: string
    name: string
    description?: string | null
    created_at: Date | string
    created_by: string
    modified_at?: Date | string | null
    modified_by?: string | null
    projects: ProjectsCreateNestedOneWithoutTasksInput
  }

  export type TasksUncheckedCreateInput = {
    id: string
    project_id: string
    name: string
    description?: string | null
    created_at: Date | string
    created_by: string
    modified_at?: Date | string | null
    modified_by?: string | null
  }

  export type TasksUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    description?: NullableStringFieldUpdateOperationsInput | string | null
    created_at?: DateTimeFieldUpdateOperationsInput | Date | string
    created_by?: StringFieldUpdateOperationsInput | string
    modified_at?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    modified_by?: NullableStringFieldUpdateOperationsInput | string | null
    projects?: ProjectsUpdateOneRequiredWithoutTasksNestedInput
  }

  export type TasksUncheckedUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    project_id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    description?: NullableStringFieldUpdateOperationsInput | string | null
    created_at?: DateTimeFieldUpdateOperationsInput | Date | string
    created_by?: StringFieldUpdateOperationsInput | string
    modified_at?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    modified_by?: NullableStringFieldUpdateOperationsInput | string | null
  }

  export type TasksCreateManyInput = {
    id: string
    project_id: string
    name: string
    description?: string | null
    created_at: Date | string
    created_by: string
    modified_at?: Date | string | null
    modified_by?: string | null
  }

  export type TasksUpdateManyMutationInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    description?: NullableStringFieldUpdateOperationsInput | string | null
    created_at?: DateTimeFieldUpdateOperationsInput | Date | string
    created_by?: StringFieldUpdateOperationsInput | string
    modified_at?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    modified_by?: NullableStringFieldUpdateOperationsInput | string | null
  }

  export type TasksUncheckedUpdateManyInput = {
    id?: StringFieldUpdateOperationsInput | string
    project_id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    description?: NullableStringFieldUpdateOperationsInput | string | null
    created_at?: DateTimeFieldUpdateOperationsInput | Date | string
    created_by?: StringFieldUpdateOperationsInput | string
    modified_at?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    modified_by?: NullableStringFieldUpdateOperationsInput | string | null
  }

  export type StringFilter = {
    equals?: string
    in?: Enumerable<string>
    notIn?: Enumerable<string>
    lt?: string
    lte?: string
    gt?: string
    gte?: string
    contains?: string
    startsWith?: string
    endsWith?: string
    mode?: QueryMode
    not?: NestedStringFilter | string
  }

  export type StringNullableFilter = {
    equals?: string | null
    in?: Enumerable<string> | null
    notIn?: Enumerable<string> | null
    lt?: string
    lte?: string
    gt?: string
    gte?: string
    contains?: string
    startsWith?: string
    endsWith?: string
    mode?: QueryMode
    not?: NestedStringNullableFilter | string | null
  }

  export type DateTimeFilter = {
    equals?: Date | string
    in?: Enumerable<Date> | Enumerable<string>
    notIn?: Enumerable<Date> | Enumerable<string>
    lt?: Date | string
    lte?: Date | string
    gt?: Date | string
    gte?: Date | string
    not?: NestedDateTimeFilter | Date | string
  }

  export type DateTimeNullableFilter = {
    equals?: Date | string | null
    in?: Enumerable<Date> | Enumerable<string> | null
    notIn?: Enumerable<Date> | Enumerable<string> | null
    lt?: Date | string
    lte?: Date | string
    gt?: Date | string
    gte?: Date | string
    not?: NestedDateTimeNullableFilter | Date | string | null
  }

  export type TasksListRelationFilter = {
    every?: TasksWhereInput
    some?: TasksWhereInput
    none?: TasksWhereInput
  }

  export type TasksOrderByRelationAggregateInput = {
    _count?: SortOrder
  }

  export type ProjectsCountOrderByAggregateInput = {
    id?: SortOrder
    organization_id?: SortOrder
    name?: SortOrder
    description?: SortOrder
    created_at?: SortOrder
    created_by?: SortOrder
    modified_at?: SortOrder
    modified_by?: SortOrder
  }

  export type ProjectsMaxOrderByAggregateInput = {
    id?: SortOrder
    organization_id?: SortOrder
    name?: SortOrder
    description?: SortOrder
    created_at?: SortOrder
    created_by?: SortOrder
    modified_at?: SortOrder
    modified_by?: SortOrder
  }

  export type ProjectsMinOrderByAggregateInput = {
    id?: SortOrder
    organization_id?: SortOrder
    name?: SortOrder
    description?: SortOrder
    created_at?: SortOrder
    created_by?: SortOrder
    modified_at?: SortOrder
    modified_by?: SortOrder
  }

  export type StringWithAggregatesFilter = {
    equals?: string
    in?: Enumerable<string>
    notIn?: Enumerable<string>
    lt?: string
    lte?: string
    gt?: string
    gte?: string
    contains?: string
    startsWith?: string
    endsWith?: string
    mode?: QueryMode
    not?: NestedStringWithAggregatesFilter | string
    _count?: NestedIntFilter
    _min?: NestedStringFilter
    _max?: NestedStringFilter
  }

  export type StringNullableWithAggregatesFilter = {
    equals?: string | null
    in?: Enumerable<string> | null
    notIn?: Enumerable<string> | null
    lt?: string
    lte?: string
    gt?: string
    gte?: string
    contains?: string
    startsWith?: string
    endsWith?: string
    mode?: QueryMode
    not?: NestedStringNullableWithAggregatesFilter | string | null
    _count?: NestedIntNullableFilter
    _min?: NestedStringNullableFilter
    _max?: NestedStringNullableFilter
  }

  export type DateTimeWithAggregatesFilter = {
    equals?: Date | string
    in?: Enumerable<Date> | Enumerable<string>
    notIn?: Enumerable<Date> | Enumerable<string>
    lt?: Date | string
    lte?: Date | string
    gt?: Date | string
    gte?: Date | string
    not?: NestedDateTimeWithAggregatesFilter | Date | string
    _count?: NestedIntFilter
    _min?: NestedDateTimeFilter
    _max?: NestedDateTimeFilter
  }

  export type DateTimeNullableWithAggregatesFilter = {
    equals?: Date | string | null
    in?: Enumerable<Date> | Enumerable<string> | null
    notIn?: Enumerable<Date> | Enumerable<string> | null
    lt?: Date | string
    lte?: Date | string
    gt?: Date | string
    gte?: Date | string
    not?: NestedDateTimeNullableWithAggregatesFilter | Date | string | null
    _count?: NestedIntNullableFilter
    _min?: NestedDateTimeNullableFilter
    _max?: NestedDateTimeNullableFilter
  }

  export type ProjectsRelationFilter = {
    is?: ProjectsWhereInput
    isNot?: ProjectsWhereInput
  }

  export type TasksCountOrderByAggregateInput = {
    id?: SortOrder
    project_id?: SortOrder
    name?: SortOrder
    description?: SortOrder
    created_at?: SortOrder
    created_by?: SortOrder
    modified_at?: SortOrder
    modified_by?: SortOrder
  }

  export type TasksMaxOrderByAggregateInput = {
    id?: SortOrder
    project_id?: SortOrder
    name?: SortOrder
    description?: SortOrder
    created_at?: SortOrder
    created_by?: SortOrder
    modified_at?: SortOrder
    modified_by?: SortOrder
  }

  export type TasksMinOrderByAggregateInput = {
    id?: SortOrder
    project_id?: SortOrder
    name?: SortOrder
    description?: SortOrder
    created_at?: SortOrder
    created_by?: SortOrder
    modified_at?: SortOrder
    modified_by?: SortOrder
  }

  export type TasksCreateNestedManyWithoutProjectsInput = {
    create?: XOR<Enumerable<TasksCreateWithoutProjectsInput>, Enumerable<TasksUncheckedCreateWithoutProjectsInput>>
    connectOrCreate?: Enumerable<TasksCreateOrConnectWithoutProjectsInput>
    createMany?: TasksCreateManyProjectsInputEnvelope
    connect?: Enumerable<TasksWhereUniqueInput>
  }

  export type TasksUncheckedCreateNestedManyWithoutProjectsInput = {
    create?: XOR<Enumerable<TasksCreateWithoutProjectsInput>, Enumerable<TasksUncheckedCreateWithoutProjectsInput>>
    connectOrCreate?: Enumerable<TasksCreateOrConnectWithoutProjectsInput>
    createMany?: TasksCreateManyProjectsInputEnvelope
    connect?: Enumerable<TasksWhereUniqueInput>
  }

  export type StringFieldUpdateOperationsInput = {
    set?: string
  }

  export type NullableStringFieldUpdateOperationsInput = {
    set?: string | null
  }

  export type DateTimeFieldUpdateOperationsInput = {
    set?: Date | string
  }

  export type NullableDateTimeFieldUpdateOperationsInput = {
    set?: Date | string | null
  }

  export type TasksUpdateManyWithoutProjectsNestedInput = {
    create?: XOR<Enumerable<TasksCreateWithoutProjectsInput>, Enumerable<TasksUncheckedCreateWithoutProjectsInput>>
    connectOrCreate?: Enumerable<TasksCreateOrConnectWithoutProjectsInput>
    upsert?: Enumerable<TasksUpsertWithWhereUniqueWithoutProjectsInput>
    createMany?: TasksCreateManyProjectsInputEnvelope
    set?: Enumerable<TasksWhereUniqueInput>
    disconnect?: Enumerable<TasksWhereUniqueInput>
    delete?: Enumerable<TasksWhereUniqueInput>
    connect?: Enumerable<TasksWhereUniqueInput>
    update?: Enumerable<TasksUpdateWithWhereUniqueWithoutProjectsInput>
    updateMany?: Enumerable<TasksUpdateManyWithWhereWithoutProjectsInput>
    deleteMany?: Enumerable<TasksScalarWhereInput>
  }

  export type TasksUncheckedUpdateManyWithoutProjectsNestedInput = {
    create?: XOR<Enumerable<TasksCreateWithoutProjectsInput>, Enumerable<TasksUncheckedCreateWithoutProjectsInput>>
    connectOrCreate?: Enumerable<TasksCreateOrConnectWithoutProjectsInput>
    upsert?: Enumerable<TasksUpsertWithWhereUniqueWithoutProjectsInput>
    createMany?: TasksCreateManyProjectsInputEnvelope
    set?: Enumerable<TasksWhereUniqueInput>
    disconnect?: Enumerable<TasksWhereUniqueInput>
    delete?: Enumerable<TasksWhereUniqueInput>
    connect?: Enumerable<TasksWhereUniqueInput>
    update?: Enumerable<TasksUpdateWithWhereUniqueWithoutProjectsInput>
    updateMany?: Enumerable<TasksUpdateManyWithWhereWithoutProjectsInput>
    deleteMany?: Enumerable<TasksScalarWhereInput>
  }

  export type ProjectsCreateNestedOneWithoutTasksInput = {
    create?: XOR<ProjectsCreateWithoutTasksInput, ProjectsUncheckedCreateWithoutTasksInput>
    connectOrCreate?: ProjectsCreateOrConnectWithoutTasksInput
    connect?: ProjectsWhereUniqueInput
  }

  export type ProjectsUpdateOneRequiredWithoutTasksNestedInput = {
    create?: XOR<ProjectsCreateWithoutTasksInput, ProjectsUncheckedCreateWithoutTasksInput>
    connectOrCreate?: ProjectsCreateOrConnectWithoutTasksInput
    upsert?: ProjectsUpsertWithoutTasksInput
    connect?: ProjectsWhereUniqueInput
    update?: XOR<ProjectsUpdateWithoutTasksInput, ProjectsUncheckedUpdateWithoutTasksInput>
  }

  export type NestedStringFilter = {
    equals?: string
    in?: Enumerable<string>
    notIn?: Enumerable<string>
    lt?: string
    lte?: string
    gt?: string
    gte?: string
    contains?: string
    startsWith?: string
    endsWith?: string
    not?: NestedStringFilter | string
  }

  export type NestedStringNullableFilter = {
    equals?: string | null
    in?: Enumerable<string> | null
    notIn?: Enumerable<string> | null
    lt?: string
    lte?: string
    gt?: string
    gte?: string
    contains?: string
    startsWith?: string
    endsWith?: string
    not?: NestedStringNullableFilter | string | null
  }

  export type NestedDateTimeFilter = {
    equals?: Date | string
    in?: Enumerable<Date> | Enumerable<string>
    notIn?: Enumerable<Date> | Enumerable<string>
    lt?: Date | string
    lte?: Date | string
    gt?: Date | string
    gte?: Date | string
    not?: NestedDateTimeFilter | Date | string
  }

  export type NestedDateTimeNullableFilter = {
    equals?: Date | string | null
    in?: Enumerable<Date> | Enumerable<string> | null
    notIn?: Enumerable<Date> | Enumerable<string> | null
    lt?: Date | string
    lte?: Date | string
    gt?: Date | string
    gte?: Date | string
    not?: NestedDateTimeNullableFilter | Date | string | null
  }

  export type NestedStringWithAggregatesFilter = {
    equals?: string
    in?: Enumerable<string>
    notIn?: Enumerable<string>
    lt?: string
    lte?: string
    gt?: string
    gte?: string
    contains?: string
    startsWith?: string
    endsWith?: string
    not?: NestedStringWithAggregatesFilter | string
    _count?: NestedIntFilter
    _min?: NestedStringFilter
    _max?: NestedStringFilter
  }

  export type NestedIntFilter = {
    equals?: number
    in?: Enumerable<number>
    notIn?: Enumerable<number>
    lt?: number
    lte?: number
    gt?: number
    gte?: number
    not?: NestedIntFilter | number
  }

  export type NestedStringNullableWithAggregatesFilter = {
    equals?: string | null
    in?: Enumerable<string> | null
    notIn?: Enumerable<string> | null
    lt?: string
    lte?: string
    gt?: string
    gte?: string
    contains?: string
    startsWith?: string
    endsWith?: string
    not?: NestedStringNullableWithAggregatesFilter | string | null
    _count?: NestedIntNullableFilter
    _min?: NestedStringNullableFilter
    _max?: NestedStringNullableFilter
  }

  export type NestedIntNullableFilter = {
    equals?: number | null
    in?: Enumerable<number> | null
    notIn?: Enumerable<number> | null
    lt?: number
    lte?: number
    gt?: number
    gte?: number
    not?: NestedIntNullableFilter | number | null
  }

  export type NestedDateTimeWithAggregatesFilter = {
    equals?: Date | string
    in?: Enumerable<Date> | Enumerable<string>
    notIn?: Enumerable<Date> | Enumerable<string>
    lt?: Date | string
    lte?: Date | string
    gt?: Date | string
    gte?: Date | string
    not?: NestedDateTimeWithAggregatesFilter | Date | string
    _count?: NestedIntFilter
    _min?: NestedDateTimeFilter
    _max?: NestedDateTimeFilter
  }

  export type NestedDateTimeNullableWithAggregatesFilter = {
    equals?: Date | string | null
    in?: Enumerable<Date> | Enumerable<string> | null
    notIn?: Enumerable<Date> | Enumerable<string> | null
    lt?: Date | string
    lte?: Date | string
    gt?: Date | string
    gte?: Date | string
    not?: NestedDateTimeNullableWithAggregatesFilter | Date | string | null
    _count?: NestedIntNullableFilter
    _min?: NestedDateTimeNullableFilter
    _max?: NestedDateTimeNullableFilter
  }

  export type TasksCreateWithoutProjectsInput = {
    id: string
    name: string
    description?: string | null
    created_at: Date | string
    created_by: string
    modified_at?: Date | string | null
    modified_by?: string | null
  }

  export type TasksUncheckedCreateWithoutProjectsInput = {
    id: string
    name: string
    description?: string | null
    created_at: Date | string
    created_by: string
    modified_at?: Date | string | null
    modified_by?: string | null
  }

  export type TasksCreateOrConnectWithoutProjectsInput = {
    where: TasksWhereUniqueInput
    create: XOR<TasksCreateWithoutProjectsInput, TasksUncheckedCreateWithoutProjectsInput>
  }

  export type TasksCreateManyProjectsInputEnvelope = {
    data: Enumerable<TasksCreateManyProjectsInput>
    skipDuplicates?: boolean
  }

  export type TasksUpsertWithWhereUniqueWithoutProjectsInput = {
    where: TasksWhereUniqueInput
    update: XOR<TasksUpdateWithoutProjectsInput, TasksUncheckedUpdateWithoutProjectsInput>
    create: XOR<TasksCreateWithoutProjectsInput, TasksUncheckedCreateWithoutProjectsInput>
  }

  export type TasksUpdateWithWhereUniqueWithoutProjectsInput = {
    where: TasksWhereUniqueInput
    data: XOR<TasksUpdateWithoutProjectsInput, TasksUncheckedUpdateWithoutProjectsInput>
  }

  export type TasksUpdateManyWithWhereWithoutProjectsInput = {
    where: TasksScalarWhereInput
    data: XOR<TasksUpdateManyMutationInput, TasksUncheckedUpdateManyWithoutTasksInput>
  }

  export type TasksScalarWhereInput = {
    AND?: Enumerable<TasksScalarWhereInput>
    OR?: Enumerable<TasksScalarWhereInput>
    NOT?: Enumerable<TasksScalarWhereInput>
    id?: StringFilter | string
    project_id?: StringFilter | string
    name?: StringFilter | string
    description?: StringNullableFilter | string | null
    created_at?: DateTimeFilter | Date | string
    created_by?: StringFilter | string
    modified_at?: DateTimeNullableFilter | Date | string | null
    modified_by?: StringNullableFilter | string | null
  }

  export type ProjectsCreateWithoutTasksInput = {
    id: string
    organization_id: string
    name: string
    description?: string | null
    created_at: Date | string
    created_by: string
    modified_at?: Date | string | null
    modified_by?: string | null
  }

  export type ProjectsUncheckedCreateWithoutTasksInput = {
    id: string
    organization_id: string
    name: string
    description?: string | null
    created_at: Date | string
    created_by: string
    modified_at?: Date | string | null
    modified_by?: string | null
  }

  export type ProjectsCreateOrConnectWithoutTasksInput = {
    where: ProjectsWhereUniqueInput
    create: XOR<ProjectsCreateWithoutTasksInput, ProjectsUncheckedCreateWithoutTasksInput>
  }

  export type ProjectsUpsertWithoutTasksInput = {
    update: XOR<ProjectsUpdateWithoutTasksInput, ProjectsUncheckedUpdateWithoutTasksInput>
    create: XOR<ProjectsCreateWithoutTasksInput, ProjectsUncheckedCreateWithoutTasksInput>
  }

  export type ProjectsUpdateWithoutTasksInput = {
    id?: StringFieldUpdateOperationsInput | string
    organization_id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    description?: NullableStringFieldUpdateOperationsInput | string | null
    created_at?: DateTimeFieldUpdateOperationsInput | Date | string
    created_by?: StringFieldUpdateOperationsInput | string
    modified_at?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    modified_by?: NullableStringFieldUpdateOperationsInput | string | null
  }

  export type ProjectsUncheckedUpdateWithoutTasksInput = {
    id?: StringFieldUpdateOperationsInput | string
    organization_id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    description?: NullableStringFieldUpdateOperationsInput | string | null
    created_at?: DateTimeFieldUpdateOperationsInput | Date | string
    created_by?: StringFieldUpdateOperationsInput | string
    modified_at?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    modified_by?: NullableStringFieldUpdateOperationsInput | string | null
  }

  export type TasksCreateManyProjectsInput = {
    id: string
    name: string
    description?: string | null
    created_at: Date | string
    created_by: string
    modified_at?: Date | string | null
    modified_by?: string | null
  }

  export type TasksUpdateWithoutProjectsInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    description?: NullableStringFieldUpdateOperationsInput | string | null
    created_at?: DateTimeFieldUpdateOperationsInput | Date | string
    created_by?: StringFieldUpdateOperationsInput | string
    modified_at?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    modified_by?: NullableStringFieldUpdateOperationsInput | string | null
  }

  export type TasksUncheckedUpdateWithoutProjectsInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    description?: NullableStringFieldUpdateOperationsInput | string | null
    created_at?: DateTimeFieldUpdateOperationsInput | Date | string
    created_by?: StringFieldUpdateOperationsInput | string
    modified_at?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    modified_by?: NullableStringFieldUpdateOperationsInput | string | null
  }

  export type TasksUncheckedUpdateManyWithoutTasksInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    description?: NullableStringFieldUpdateOperationsInput | string | null
    created_at?: DateTimeFieldUpdateOperationsInput | Date | string
    created_by?: StringFieldUpdateOperationsInput | string
    modified_at?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    modified_by?: NullableStringFieldUpdateOperationsInput | string | null
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
