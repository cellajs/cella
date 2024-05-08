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
  /**
   * @zod.string.uuid()
   */
  id: string
  name: string
  color: string | null
  /**
   * @zod.string.uuid()
   */
  project_id: string
}

/**
 * Model Projects
 * 
 */
export type Projects = {
  /**
   * @zod.string.uuid()
   */
  id: string
  slug: string
  name: string
  color: string
  workspace_id: string
  created_at: Date
  created_by: string
  modified_at: Date | null
  modified_by: string | null
}

/**
 * Model Task_labels
 * 
 */
export type Task_labels = {
  /**
   * @zod.string.uuid()
   */
  task_id: string
  /**
   * @zod.string.uuid()
   */
  label_id: string
}

/**
 * Model Task_users
 * 
 */
export type Task_users = {
  /**
   * @zod.string.uuid()
   */
  task_id: string
  /**
   * @zod.string.uuid()
   */
  user_id: string
  role: string
}

/**
 * Model Tasks
 * 
 */
export type Tasks = {
  /**
   * @zod.string.uuid()
   */
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
  status: number
  /**
   * @zod.string.uuid()
   */
  project_id: string
  created_at: Date
  created_by: string
  assigned_by: string | null
  assigned_at: Date | null
  modified_at: Date | null
  modified_by: string | null
  /**
   * @zod.number.int().gte(-2147483648).lte(2147483647)
   */
  sort_order: number | null
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
   * `prisma.projects`: Exposes CRUD operations for the **Projects** model.
    * Example usage:
    * ```ts
    * // Fetch zero or more Projects
    * const projects = await prisma.projects.findMany()
    * ```
    */
  get projects(): Prisma.ProjectsDelegate<GlobalReject>;

  /**
   * `prisma.task_labels`: Exposes CRUD operations for the **Task_labels** model.
    * Example usage:
    * ```ts
    * // Fetch zero or more Task_labels
    * const task_labels = await prisma.task_labels.findMany()
    * ```
    */
  get task_labels(): Prisma.Task_labelsDelegate<GlobalReject>;

  /**
   * `prisma.task_users`: Exposes CRUD operations for the **Task_users** model.
    * Example usage:
    * ```ts
    * // Fetch zero or more Task_users
    * const task_users = await prisma.task_users.findMany()
    * ```
    */
  get task_users(): Prisma.Task_usersDelegate<GlobalReject>;

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
    Labels: 'Labels',
    Projects: 'Projects',
    Task_labels: 'Task_labels',
    Task_users: 'Task_users',
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
   * Count Type LabelsCountOutputType
   */


  export type LabelsCountOutputType = {
    task_labels: number
  }

  export type LabelsCountOutputTypeSelect = {
    task_labels?: boolean
  }

  export type LabelsCountOutputTypeGetPayload<S extends boolean | null | undefined | LabelsCountOutputTypeArgs> =
    S extends { select: any, include: any } ? 'Please either choose `select` or `include`' :
    S extends true ? LabelsCountOutputType :
    S extends undefined ? never :
    S extends { include: any } & (LabelsCountOutputTypeArgs)
    ? LabelsCountOutputType 
    : S extends { select: any } & (LabelsCountOutputTypeArgs)
      ? {
    [P in TruthyKeys<S['select']>]:
    P extends keyof LabelsCountOutputType ? LabelsCountOutputType[P] : never
  } 
      : LabelsCountOutputType




  // Custom InputTypes

  /**
   * LabelsCountOutputType without action
   */
  export type LabelsCountOutputTypeArgs = {
    /**
     * Select specific fields to fetch from the LabelsCountOutputType
     * 
    **/
    select?: LabelsCountOutputTypeSelect | null
  }



  /**
   * Count Type ProjectsCountOutputType
   */


  export type ProjectsCountOutputType = {
    labels: number
    tasks: number
  }

  export type ProjectsCountOutputTypeSelect = {
    labels?: boolean
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
   * Count Type TasksCountOutputType
   */


  export type TasksCountOutputType = {
    task_labels: number
    task_users: number
  }

  export type TasksCountOutputTypeSelect = {
    task_labels?: boolean
    task_users?: boolean
  }

  export type TasksCountOutputTypeGetPayload<S extends boolean | null | undefined | TasksCountOutputTypeArgs> =
    S extends { select: any, include: any } ? 'Please either choose `select` or `include`' :
    S extends true ? TasksCountOutputType :
    S extends undefined ? never :
    S extends { include: any } & (TasksCountOutputTypeArgs)
    ? TasksCountOutputType 
    : S extends { select: any } & (TasksCountOutputTypeArgs)
      ? {
    [P in TruthyKeys<S['select']>]:
    P extends keyof TasksCountOutputType ? TasksCountOutputType[P] : never
  } 
      : TasksCountOutputType




  // Custom InputTypes

  /**
   * TasksCountOutputType without action
   */
  export type TasksCountOutputTypeArgs = {
    /**
     * Select specific fields to fetch from the TasksCountOutputType
     * 
    **/
    select?: TasksCountOutputTypeSelect | null
  }



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
    projects?: boolean | ProjectsArgs
    task_labels?: boolean | Labels$task_labelsArgs
    _count?: boolean | LabelsCountOutputTypeArgs
  }


  export type LabelsInclude = {
    projects?: boolean | ProjectsArgs
    task_labels?: boolean | Labels$task_labelsArgs
    _count?: boolean | LabelsCountOutputTypeArgs
  } 

  export type LabelsGetPayload<S extends boolean | null | undefined | LabelsArgs> =
    S extends { select: any, include: any } ? 'Please either choose `select` or `include`' :
    S extends true ? Labels :
    S extends undefined ? never :
    S extends { include: any } & (LabelsArgs | LabelsFindManyArgs)
    ? Labels  & {
    [P in TruthyKeys<S['include']>]:
        P extends 'projects' ? ProjectsGetPayload<S['include'][P]> :
        P extends 'task_labels' ? Array < Task_labelsGetPayload<S['include'][P]>>  :
        P extends '_count' ? LabelsCountOutputTypeGetPayload<S['include'][P]> :  never
  } 
    : S extends { select: any } & (LabelsArgs | LabelsFindManyArgs)
      ? {
    [P in TruthyKeys<S['select']>]:
        P extends 'projects' ? ProjectsGetPayload<S['select'][P]> :
        P extends 'task_labels' ? Array < Task_labelsGetPayload<S['select'][P]>>  :
        P extends '_count' ? LabelsCountOutputTypeGetPayload<S['select'][P]> :  P extends keyof Labels ? Labels[P] : never
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

    projects<T extends ProjectsArgs= {}>(args?: Subset<T, ProjectsArgs>): Prisma__ProjectsClient<ProjectsGetPayload<T> | Null>;

    task_labels<T extends Labels$task_labelsArgs= {}>(args?: Subset<T, Labels$task_labelsArgs>): PrismaPromise<Array<Task_labelsGetPayload<T>>| Null>;

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
     * Choose, which related nodes to fetch as well.
     * 
    **/
    include?: LabelsInclude | null
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
     * Choose, which related nodes to fetch as well.
     * 
    **/
    include?: LabelsInclude | null
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
     * Choose, which related nodes to fetch as well.
     * 
    **/
    include?: LabelsInclude | null
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
     * Choose, which related nodes to fetch as well.
     * 
    **/
    include?: LabelsInclude | null
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
     * Choose, which related nodes to fetch as well.
     * 
    **/
    include?: LabelsInclude | null
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
     * Choose, which related nodes to fetch as well.
     * 
    **/
    include?: LabelsInclude | null
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
     * Choose, which related nodes to fetch as well.
     * 
    **/
    include?: LabelsInclude | null
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
     * Choose, which related nodes to fetch as well.
     * 
    **/
    include?: LabelsInclude | null
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
     * Choose, which related nodes to fetch as well.
     * 
    **/
    include?: LabelsInclude | null
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
   * Labels.task_labels
   */
  export type Labels$task_labelsArgs = {
    /**
     * Select specific fields to fetch from the Task_labels
     * 
    **/
    select?: Task_labelsSelect | null
    /**
     * Choose, which related nodes to fetch as well.
     * 
    **/
    include?: Task_labelsInclude | null
    where?: Task_labelsWhereInput
    orderBy?: Enumerable<Task_labelsOrderByWithRelationInput>
    cursor?: Task_labelsWhereUniqueInput
    take?: number
    skip?: number
    distinct?: Enumerable<Task_labelsScalarFieldEnum>
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
    /**
     * Choose, which related nodes to fetch as well.
     * 
    **/
    include?: LabelsInclude | null
  }



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
    slug: string | null
    name: string | null
    color: string | null
    workspace_id: string | null
    created_at: Date | null
    created_by: string | null
    modified_at: Date | null
    modified_by: string | null
  }

  export type ProjectsMaxAggregateOutputType = {
    id: string | null
    slug: string | null
    name: string | null
    color: string | null
    workspace_id: string | null
    created_at: Date | null
    created_by: string | null
    modified_at: Date | null
    modified_by: string | null
  }

  export type ProjectsCountAggregateOutputType = {
    id: number
    slug: number
    name: number
    color: number
    workspace_id: number
    created_at: number
    created_by: number
    modified_at: number
    modified_by: number
    _all: number
  }


  export type ProjectsMinAggregateInputType = {
    id?: true
    slug?: true
    name?: true
    color?: true
    workspace_id?: true
    created_at?: true
    created_by?: true
    modified_at?: true
    modified_by?: true
  }

  export type ProjectsMaxAggregateInputType = {
    id?: true
    slug?: true
    name?: true
    color?: true
    workspace_id?: true
    created_at?: true
    created_by?: true
    modified_at?: true
    modified_by?: true
  }

  export type ProjectsCountAggregateInputType = {
    id?: true
    slug?: true
    name?: true
    color?: true
    workspace_id?: true
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
    slug: string
    name: string
    color: string
    workspace_id: string
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
    slug?: boolean
    name?: boolean
    color?: boolean
    workspace_id?: boolean
    created_at?: boolean
    created_by?: boolean
    modified_at?: boolean
    modified_by?: boolean
    labels?: boolean | Projects$labelsArgs
    tasks?: boolean | Projects$tasksArgs
    _count?: boolean | ProjectsCountOutputTypeArgs
  }


  export type ProjectsInclude = {
    labels?: boolean | Projects$labelsArgs
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
        P extends 'labels' ? Array < LabelsGetPayload<S['include'][P]>>  :
        P extends 'tasks' ? Array < TasksGetPayload<S['include'][P]>>  :
        P extends '_count' ? ProjectsCountOutputTypeGetPayload<S['include'][P]> :  never
  } 
    : S extends { select: any } & (ProjectsArgs | ProjectsFindManyArgs)
      ? {
    [P in TruthyKeys<S['select']>]:
        P extends 'labels' ? Array < LabelsGetPayload<S['select'][P]>>  :
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

    labels<T extends Projects$labelsArgs= {}>(args?: Subset<T, Projects$labelsArgs>): PrismaPromise<Array<LabelsGetPayload<T>>| Null>;

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
   * Projects.labels
   */
  export type Projects$labelsArgs = {
    /**
     * Select specific fields to fetch from the Labels
     * 
    **/
    select?: LabelsSelect | null
    /**
     * Choose, which related nodes to fetch as well.
     * 
    **/
    include?: LabelsInclude | null
    where?: LabelsWhereInput
    orderBy?: Enumerable<LabelsOrderByWithRelationInput>
    cursor?: LabelsWhereUniqueInput
    take?: number
    skip?: number
    distinct?: Enumerable<LabelsScalarFieldEnum>
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
   * Model Task_labels
   */


  export type AggregateTask_labels = {
    _count: Task_labelsCountAggregateOutputType | null
    _min: Task_labelsMinAggregateOutputType | null
    _max: Task_labelsMaxAggregateOutputType | null
  }

  export type Task_labelsMinAggregateOutputType = {
    task_id: string | null
    label_id: string | null
  }

  export type Task_labelsMaxAggregateOutputType = {
    task_id: string | null
    label_id: string | null
  }

  export type Task_labelsCountAggregateOutputType = {
    task_id: number
    label_id: number
    _all: number
  }


  export type Task_labelsMinAggregateInputType = {
    task_id?: true
    label_id?: true
  }

  export type Task_labelsMaxAggregateInputType = {
    task_id?: true
    label_id?: true
  }

  export type Task_labelsCountAggregateInputType = {
    task_id?: true
    label_id?: true
    _all?: true
  }

  export type Task_labelsAggregateArgs = {
    /**
     * Filter which Task_labels to aggregate.
     * 
    **/
    where?: Task_labelsWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Task_labels to fetch.
     * 
    **/
    orderBy?: Enumerable<Task_labelsOrderByWithRelationInput>
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the start position
     * 
    **/
    cursor?: Task_labelsWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Task_labels from the position of the cursor.
     * 
    **/
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Task_labels.
     * 
    **/
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Count returned Task_labels
    **/
    _count?: true | Task_labelsCountAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the minimum value
    **/
    _min?: Task_labelsMinAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the maximum value
    **/
    _max?: Task_labelsMaxAggregateInputType
  }

  export type GetTask_labelsAggregateType<T extends Task_labelsAggregateArgs> = {
        [P in keyof T & keyof AggregateTask_labels]: P extends '_count' | 'count'
      ? T[P] extends true
        ? number
        : GetScalarType<T[P], AggregateTask_labels[P]>
      : GetScalarType<T[P], AggregateTask_labels[P]>
  }




  export type Task_labelsGroupByArgs = {
    where?: Task_labelsWhereInput
    orderBy?: Enumerable<Task_labelsOrderByWithAggregationInput>
    by: Array<Task_labelsScalarFieldEnum>
    having?: Task_labelsScalarWhereWithAggregatesInput
    take?: number
    skip?: number
    _count?: Task_labelsCountAggregateInputType | true
    _min?: Task_labelsMinAggregateInputType
    _max?: Task_labelsMaxAggregateInputType
  }


  export type Task_labelsGroupByOutputType = {
    task_id: string
    label_id: string
    _count: Task_labelsCountAggregateOutputType | null
    _min: Task_labelsMinAggregateOutputType | null
    _max: Task_labelsMaxAggregateOutputType | null
  }

  type GetTask_labelsGroupByPayload<T extends Task_labelsGroupByArgs> = PrismaPromise<
    Array<
      PickArray<Task_labelsGroupByOutputType, T['by']> &
        {
          [P in ((keyof T) & (keyof Task_labelsGroupByOutputType))]: P extends '_count'
            ? T[P] extends boolean
              ? number
              : GetScalarType<T[P], Task_labelsGroupByOutputType[P]>
            : GetScalarType<T[P], Task_labelsGroupByOutputType[P]>
        }
      >
    >


  export type Task_labelsSelect = {
    task_id?: boolean
    label_id?: boolean
    labels?: boolean | LabelsArgs
    tasks?: boolean | TasksArgs
  }


  export type Task_labelsInclude = {
    labels?: boolean | LabelsArgs
    tasks?: boolean | TasksArgs
  } 

  export type Task_labelsGetPayload<S extends boolean | null | undefined | Task_labelsArgs> =
    S extends { select: any, include: any } ? 'Please either choose `select` or `include`' :
    S extends true ? Task_labels :
    S extends undefined ? never :
    S extends { include: any } & (Task_labelsArgs | Task_labelsFindManyArgs)
    ? Task_labels  & {
    [P in TruthyKeys<S['include']>]:
        P extends 'labels' ? LabelsGetPayload<S['include'][P]> :
        P extends 'tasks' ? TasksGetPayload<S['include'][P]> :  never
  } 
    : S extends { select: any } & (Task_labelsArgs | Task_labelsFindManyArgs)
      ? {
    [P in TruthyKeys<S['select']>]:
        P extends 'labels' ? LabelsGetPayload<S['select'][P]> :
        P extends 'tasks' ? TasksGetPayload<S['select'][P]> :  P extends keyof Task_labels ? Task_labels[P] : never
  } 
      : Task_labels


  type Task_labelsCountArgs = Merge<
    Omit<Task_labelsFindManyArgs, 'select' | 'include'> & {
      select?: Task_labelsCountAggregateInputType | true
    }
  >

  export interface Task_labelsDelegate<GlobalRejectSettings extends Prisma.RejectOnNotFound | Prisma.RejectPerOperation | false | undefined> {
    /**
     * Find zero or one Task_labels that matches the filter.
     * @param {Task_labelsFindUniqueArgs} args - Arguments to find a Task_labels
     * @example
     * // Get one Task_labels
     * const task_labels = await prisma.task_labels.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
    **/
    findUnique<T extends Task_labelsFindUniqueArgs,  LocalRejectSettings = T["rejectOnNotFound"] extends RejectOnNotFound ? T['rejectOnNotFound'] : undefined>(
      args: SelectSubset<T, Task_labelsFindUniqueArgs>
    ): HasReject<GlobalRejectSettings, LocalRejectSettings, 'findUnique', 'Task_labels'> extends True ? Prisma__Task_labelsClient<Task_labelsGetPayload<T>> : Prisma__Task_labelsClient<Task_labelsGetPayload<T> | null, null>

    /**
     * Find one Task_labels that matches the filter or throw an error  with `error.code='P2025'` 
     *     if no matches were found.
     * @param {Task_labelsFindUniqueOrThrowArgs} args - Arguments to find a Task_labels
     * @example
     * // Get one Task_labels
     * const task_labels = await prisma.task_labels.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
    **/
    findUniqueOrThrow<T extends Task_labelsFindUniqueOrThrowArgs>(
      args?: SelectSubset<T, Task_labelsFindUniqueOrThrowArgs>
    ): Prisma__Task_labelsClient<Task_labelsGetPayload<T>>

    /**
     * Find the first Task_labels that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {Task_labelsFindFirstArgs} args - Arguments to find a Task_labels
     * @example
     * // Get one Task_labels
     * const task_labels = await prisma.task_labels.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
    **/
    findFirst<T extends Task_labelsFindFirstArgs,  LocalRejectSettings = T["rejectOnNotFound"] extends RejectOnNotFound ? T['rejectOnNotFound'] : undefined>(
      args?: SelectSubset<T, Task_labelsFindFirstArgs>
    ): HasReject<GlobalRejectSettings, LocalRejectSettings, 'findFirst', 'Task_labels'> extends True ? Prisma__Task_labelsClient<Task_labelsGetPayload<T>> : Prisma__Task_labelsClient<Task_labelsGetPayload<T> | null, null>

    /**
     * Find the first Task_labels that matches the filter or
     * throw `NotFoundError` if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {Task_labelsFindFirstOrThrowArgs} args - Arguments to find a Task_labels
     * @example
     * // Get one Task_labels
     * const task_labels = await prisma.task_labels.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
    **/
    findFirstOrThrow<T extends Task_labelsFindFirstOrThrowArgs>(
      args?: SelectSubset<T, Task_labelsFindFirstOrThrowArgs>
    ): Prisma__Task_labelsClient<Task_labelsGetPayload<T>>

    /**
     * Find zero or more Task_labels that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {Task_labelsFindManyArgs=} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all Task_labels
     * const task_labels = await prisma.task_labels.findMany()
     * 
     * // Get first 10 Task_labels
     * const task_labels = await prisma.task_labels.findMany({ take: 10 })
     * 
     * // Only select the `task_id`
     * const task_labelsWithTask_idOnly = await prisma.task_labels.findMany({ select: { task_id: true } })
     * 
    **/
    findMany<T extends Task_labelsFindManyArgs>(
      args?: SelectSubset<T, Task_labelsFindManyArgs>
    ): PrismaPromise<Array<Task_labelsGetPayload<T>>>

    /**
     * Create a Task_labels.
     * @param {Task_labelsCreateArgs} args - Arguments to create a Task_labels.
     * @example
     * // Create one Task_labels
     * const Task_labels = await prisma.task_labels.create({
     *   data: {
     *     // ... data to create a Task_labels
     *   }
     * })
     * 
    **/
    create<T extends Task_labelsCreateArgs>(
      args: SelectSubset<T, Task_labelsCreateArgs>
    ): Prisma__Task_labelsClient<Task_labelsGetPayload<T>>

    /**
     * Create many Task_labels.
     *     @param {Task_labelsCreateManyArgs} args - Arguments to create many Task_labels.
     *     @example
     *     // Create many Task_labels
     *     const task_labels = await prisma.task_labels.createMany({
     *       data: {
     *         // ... provide data here
     *       }
     *     })
     *     
    **/
    createMany<T extends Task_labelsCreateManyArgs>(
      args?: SelectSubset<T, Task_labelsCreateManyArgs>
    ): PrismaPromise<BatchPayload>

    /**
     * Delete a Task_labels.
     * @param {Task_labelsDeleteArgs} args - Arguments to delete one Task_labels.
     * @example
     * // Delete one Task_labels
     * const Task_labels = await prisma.task_labels.delete({
     *   where: {
     *     // ... filter to delete one Task_labels
     *   }
     * })
     * 
    **/
    delete<T extends Task_labelsDeleteArgs>(
      args: SelectSubset<T, Task_labelsDeleteArgs>
    ): Prisma__Task_labelsClient<Task_labelsGetPayload<T>>

    /**
     * Update one Task_labels.
     * @param {Task_labelsUpdateArgs} args - Arguments to update one Task_labels.
     * @example
     * // Update one Task_labels
     * const task_labels = await prisma.task_labels.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
    **/
    update<T extends Task_labelsUpdateArgs>(
      args: SelectSubset<T, Task_labelsUpdateArgs>
    ): Prisma__Task_labelsClient<Task_labelsGetPayload<T>>

    /**
     * Delete zero or more Task_labels.
     * @param {Task_labelsDeleteManyArgs} args - Arguments to filter Task_labels to delete.
     * @example
     * // Delete a few Task_labels
     * const { count } = await prisma.task_labels.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     * 
    **/
    deleteMany<T extends Task_labelsDeleteManyArgs>(
      args?: SelectSubset<T, Task_labelsDeleteManyArgs>
    ): PrismaPromise<BatchPayload>

    /**
     * Update zero or more Task_labels.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {Task_labelsUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many Task_labels
     * const task_labels = await prisma.task_labels.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
    **/
    updateMany<T extends Task_labelsUpdateManyArgs>(
      args: SelectSubset<T, Task_labelsUpdateManyArgs>
    ): PrismaPromise<BatchPayload>

    /**
     * Create or update one Task_labels.
     * @param {Task_labelsUpsertArgs} args - Arguments to update or create a Task_labels.
     * @example
     * // Update or create a Task_labels
     * const task_labels = await prisma.task_labels.upsert({
     *   create: {
     *     // ... data to create a Task_labels
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the Task_labels we want to update
     *   }
     * })
    **/
    upsert<T extends Task_labelsUpsertArgs>(
      args: SelectSubset<T, Task_labelsUpsertArgs>
    ): Prisma__Task_labelsClient<Task_labelsGetPayload<T>>

    /**
     * Count the number of Task_labels.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {Task_labelsCountArgs} args - Arguments to filter Task_labels to count.
     * @example
     * // Count the number of Task_labels
     * const count = await prisma.task_labels.count({
     *   where: {
     *     // ... the filter for the Task_labels we want to count
     *   }
     * })
    **/
    count<T extends Task_labelsCountArgs>(
      args?: Subset<T, Task_labelsCountArgs>,
    ): PrismaPromise<
      T extends _Record<'select', any>
        ? T['select'] extends true
          ? number
          : GetScalarType<T['select'], Task_labelsCountAggregateOutputType>
        : number
    >

    /**
     * Allows you to perform aggregations operations on a Task_labels.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {Task_labelsAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
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
    aggregate<T extends Task_labelsAggregateArgs>(args: Subset<T, Task_labelsAggregateArgs>): PrismaPromise<GetTask_labelsAggregateType<T>>

    /**
     * Group by Task_labels.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {Task_labelsGroupByArgs} args - Group by arguments.
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
      T extends Task_labelsGroupByArgs,
      HasSelectOrTake extends Or<
        Extends<'skip', Keys<T>>,
        Extends<'take', Keys<T>>
      >,
      OrderByArg extends True extends HasSelectOrTake
        ? { orderBy: Task_labelsGroupByArgs['orderBy'] }
        : { orderBy?: Task_labelsGroupByArgs['orderBy'] },
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
    >(args: SubsetIntersection<T, Task_labelsGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetTask_labelsGroupByPayload<T> : PrismaPromise<InputErrors>

  }

  /**
   * The delegate class that acts as a "Promise-like" for Task_labels.
   * Why is this prefixed with `Prisma__`?
   * Because we want to prevent naming conflicts as mentioned in
   * https://github.com/prisma/prisma-client-js/issues/707
   */
  export class Prisma__Task_labelsClient<T, Null = never> implements PrismaPromise<T> {
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

    labels<T extends LabelsArgs= {}>(args?: Subset<T, LabelsArgs>): Prisma__LabelsClient<LabelsGetPayload<T> | Null>;

    tasks<T extends TasksArgs= {}>(args?: Subset<T, TasksArgs>): Prisma__TasksClient<TasksGetPayload<T> | Null>;

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
   * Task_labels base type for findUnique actions
   */
  export type Task_labelsFindUniqueArgsBase = {
    /**
     * Select specific fields to fetch from the Task_labels
     * 
    **/
    select?: Task_labelsSelect | null
    /**
     * Choose, which related nodes to fetch as well.
     * 
    **/
    include?: Task_labelsInclude | null
    /**
     * Filter, which Task_labels to fetch.
     * 
    **/
    where: Task_labelsWhereUniqueInput
  }

  /**
   * Task_labels findUnique
   */
  export interface Task_labelsFindUniqueArgs extends Task_labelsFindUniqueArgsBase {
   /**
    * Throw an Error if query returns no results
    * @deprecated since 4.0.0: use `findUniqueOrThrow` method instead
    */
    rejectOnNotFound?: RejectOnNotFound
  }
      

  /**
   * Task_labels findUniqueOrThrow
   */
  export type Task_labelsFindUniqueOrThrowArgs = {
    /**
     * Select specific fields to fetch from the Task_labels
     * 
    **/
    select?: Task_labelsSelect | null
    /**
     * Choose, which related nodes to fetch as well.
     * 
    **/
    include?: Task_labelsInclude | null
    /**
     * Filter, which Task_labels to fetch.
     * 
    **/
    where: Task_labelsWhereUniqueInput
  }


  /**
   * Task_labels base type for findFirst actions
   */
  export type Task_labelsFindFirstArgsBase = {
    /**
     * Select specific fields to fetch from the Task_labels
     * 
    **/
    select?: Task_labelsSelect | null
    /**
     * Choose, which related nodes to fetch as well.
     * 
    **/
    include?: Task_labelsInclude | null
    /**
     * Filter, which Task_labels to fetch.
     * 
    **/
    where?: Task_labelsWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Task_labels to fetch.
     * 
    **/
    orderBy?: Enumerable<Task_labelsOrderByWithRelationInput>
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for Task_labels.
     * 
    **/
    cursor?: Task_labelsWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Task_labels from the position of the cursor.
     * 
    **/
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Task_labels.
     * 
    **/
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of Task_labels.
     * 
    **/
    distinct?: Enumerable<Task_labelsScalarFieldEnum>
  }

  /**
   * Task_labels findFirst
   */
  export interface Task_labelsFindFirstArgs extends Task_labelsFindFirstArgsBase {
   /**
    * Throw an Error if query returns no results
    * @deprecated since 4.0.0: use `findFirstOrThrow` method instead
    */
    rejectOnNotFound?: RejectOnNotFound
  }
      

  /**
   * Task_labels findFirstOrThrow
   */
  export type Task_labelsFindFirstOrThrowArgs = {
    /**
     * Select specific fields to fetch from the Task_labels
     * 
    **/
    select?: Task_labelsSelect | null
    /**
     * Choose, which related nodes to fetch as well.
     * 
    **/
    include?: Task_labelsInclude | null
    /**
     * Filter, which Task_labels to fetch.
     * 
    **/
    where?: Task_labelsWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Task_labels to fetch.
     * 
    **/
    orderBy?: Enumerable<Task_labelsOrderByWithRelationInput>
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for Task_labels.
     * 
    **/
    cursor?: Task_labelsWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Task_labels from the position of the cursor.
     * 
    **/
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Task_labels.
     * 
    **/
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of Task_labels.
     * 
    **/
    distinct?: Enumerable<Task_labelsScalarFieldEnum>
  }


  /**
   * Task_labels findMany
   */
  export type Task_labelsFindManyArgs = {
    /**
     * Select specific fields to fetch from the Task_labels
     * 
    **/
    select?: Task_labelsSelect | null
    /**
     * Choose, which related nodes to fetch as well.
     * 
    **/
    include?: Task_labelsInclude | null
    /**
     * Filter, which Task_labels to fetch.
     * 
    **/
    where?: Task_labelsWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Task_labels to fetch.
     * 
    **/
    orderBy?: Enumerable<Task_labelsOrderByWithRelationInput>
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for listing Task_labels.
     * 
    **/
    cursor?: Task_labelsWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Task_labels from the position of the cursor.
     * 
    **/
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Task_labels.
     * 
    **/
    skip?: number
    distinct?: Enumerable<Task_labelsScalarFieldEnum>
  }


  /**
   * Task_labels create
   */
  export type Task_labelsCreateArgs = {
    /**
     * Select specific fields to fetch from the Task_labels
     * 
    **/
    select?: Task_labelsSelect | null
    /**
     * Choose, which related nodes to fetch as well.
     * 
    **/
    include?: Task_labelsInclude | null
    /**
     * The data needed to create a Task_labels.
     * 
    **/
    data: XOR<Task_labelsCreateInput, Task_labelsUncheckedCreateInput>
  }


  /**
   * Task_labels createMany
   */
  export type Task_labelsCreateManyArgs = {
    /**
     * The data used to create many Task_labels.
     * 
    **/
    data: Enumerable<Task_labelsCreateManyInput>
    skipDuplicates?: boolean
  }


  /**
   * Task_labels update
   */
  export type Task_labelsUpdateArgs = {
    /**
     * Select specific fields to fetch from the Task_labels
     * 
    **/
    select?: Task_labelsSelect | null
    /**
     * Choose, which related nodes to fetch as well.
     * 
    **/
    include?: Task_labelsInclude | null
    /**
     * The data needed to update a Task_labels.
     * 
    **/
    data: XOR<Task_labelsUpdateInput, Task_labelsUncheckedUpdateInput>
    /**
     * Choose, which Task_labels to update.
     * 
    **/
    where: Task_labelsWhereUniqueInput
  }


  /**
   * Task_labels updateMany
   */
  export type Task_labelsUpdateManyArgs = {
    /**
     * The data used to update Task_labels.
     * 
    **/
    data: XOR<Task_labelsUpdateManyMutationInput, Task_labelsUncheckedUpdateManyInput>
    /**
     * Filter which Task_labels to update
     * 
    **/
    where?: Task_labelsWhereInput
  }


  /**
   * Task_labels upsert
   */
  export type Task_labelsUpsertArgs = {
    /**
     * Select specific fields to fetch from the Task_labels
     * 
    **/
    select?: Task_labelsSelect | null
    /**
     * Choose, which related nodes to fetch as well.
     * 
    **/
    include?: Task_labelsInclude | null
    /**
     * The filter to search for the Task_labels to update in case it exists.
     * 
    **/
    where: Task_labelsWhereUniqueInput
    /**
     * In case the Task_labels found by the `where` argument doesn't exist, create a new Task_labels with this data.
     * 
    **/
    create: XOR<Task_labelsCreateInput, Task_labelsUncheckedCreateInput>
    /**
     * In case the Task_labels was found with the provided `where` argument, update it with this data.
     * 
    **/
    update: XOR<Task_labelsUpdateInput, Task_labelsUncheckedUpdateInput>
  }


  /**
   * Task_labels delete
   */
  export type Task_labelsDeleteArgs = {
    /**
     * Select specific fields to fetch from the Task_labels
     * 
    **/
    select?: Task_labelsSelect | null
    /**
     * Choose, which related nodes to fetch as well.
     * 
    **/
    include?: Task_labelsInclude | null
    /**
     * Filter which Task_labels to delete.
     * 
    **/
    where: Task_labelsWhereUniqueInput
  }


  /**
   * Task_labels deleteMany
   */
  export type Task_labelsDeleteManyArgs = {
    /**
     * Filter which Task_labels to delete
     * 
    **/
    where?: Task_labelsWhereInput
  }


  /**
   * Task_labels without action
   */
  export type Task_labelsArgs = {
    /**
     * Select specific fields to fetch from the Task_labels
     * 
    **/
    select?: Task_labelsSelect | null
    /**
     * Choose, which related nodes to fetch as well.
     * 
    **/
    include?: Task_labelsInclude | null
  }



  /**
   * Model Task_users
   */


  export type AggregateTask_users = {
    _count: Task_usersCountAggregateOutputType | null
    _min: Task_usersMinAggregateOutputType | null
    _max: Task_usersMaxAggregateOutputType | null
  }

  export type Task_usersMinAggregateOutputType = {
    task_id: string | null
    user_id: string | null
    role: string | null
  }

  export type Task_usersMaxAggregateOutputType = {
    task_id: string | null
    user_id: string | null
    role: string | null
  }

  export type Task_usersCountAggregateOutputType = {
    task_id: number
    user_id: number
    role: number
    _all: number
  }


  export type Task_usersMinAggregateInputType = {
    task_id?: true
    user_id?: true
    role?: true
  }

  export type Task_usersMaxAggregateInputType = {
    task_id?: true
    user_id?: true
    role?: true
  }

  export type Task_usersCountAggregateInputType = {
    task_id?: true
    user_id?: true
    role?: true
    _all?: true
  }

  export type Task_usersAggregateArgs = {
    /**
     * Filter which Task_users to aggregate.
     * 
    **/
    where?: Task_usersWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Task_users to fetch.
     * 
    **/
    orderBy?: Enumerable<Task_usersOrderByWithRelationInput>
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the start position
     * 
    **/
    cursor?: Task_usersWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Task_users from the position of the cursor.
     * 
    **/
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Task_users.
     * 
    **/
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Count returned Task_users
    **/
    _count?: true | Task_usersCountAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the minimum value
    **/
    _min?: Task_usersMinAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the maximum value
    **/
    _max?: Task_usersMaxAggregateInputType
  }

  export type GetTask_usersAggregateType<T extends Task_usersAggregateArgs> = {
        [P in keyof T & keyof AggregateTask_users]: P extends '_count' | 'count'
      ? T[P] extends true
        ? number
        : GetScalarType<T[P], AggregateTask_users[P]>
      : GetScalarType<T[P], AggregateTask_users[P]>
  }




  export type Task_usersGroupByArgs = {
    where?: Task_usersWhereInput
    orderBy?: Enumerable<Task_usersOrderByWithAggregationInput>
    by: Array<Task_usersScalarFieldEnum>
    having?: Task_usersScalarWhereWithAggregatesInput
    take?: number
    skip?: number
    _count?: Task_usersCountAggregateInputType | true
    _min?: Task_usersMinAggregateInputType
    _max?: Task_usersMaxAggregateInputType
  }


  export type Task_usersGroupByOutputType = {
    task_id: string
    user_id: string
    role: string
    _count: Task_usersCountAggregateOutputType | null
    _min: Task_usersMinAggregateOutputType | null
    _max: Task_usersMaxAggregateOutputType | null
  }

  type GetTask_usersGroupByPayload<T extends Task_usersGroupByArgs> = PrismaPromise<
    Array<
      PickArray<Task_usersGroupByOutputType, T['by']> &
        {
          [P in ((keyof T) & (keyof Task_usersGroupByOutputType))]: P extends '_count'
            ? T[P] extends boolean
              ? number
              : GetScalarType<T[P], Task_usersGroupByOutputType[P]>
            : GetScalarType<T[P], Task_usersGroupByOutputType[P]>
        }
      >
    >


  export type Task_usersSelect = {
    task_id?: boolean
    user_id?: boolean
    role?: boolean
    tasks?: boolean | TasksArgs
  }


  export type Task_usersInclude = {
    tasks?: boolean | TasksArgs
  } 

  export type Task_usersGetPayload<S extends boolean | null | undefined | Task_usersArgs> =
    S extends { select: any, include: any } ? 'Please either choose `select` or `include`' :
    S extends true ? Task_users :
    S extends undefined ? never :
    S extends { include: any } & (Task_usersArgs | Task_usersFindManyArgs)
    ? Task_users  & {
    [P in TruthyKeys<S['include']>]:
        P extends 'tasks' ? TasksGetPayload<S['include'][P]> :  never
  } 
    : S extends { select: any } & (Task_usersArgs | Task_usersFindManyArgs)
      ? {
    [P in TruthyKeys<S['select']>]:
        P extends 'tasks' ? TasksGetPayload<S['select'][P]> :  P extends keyof Task_users ? Task_users[P] : never
  } 
      : Task_users


  type Task_usersCountArgs = Merge<
    Omit<Task_usersFindManyArgs, 'select' | 'include'> & {
      select?: Task_usersCountAggregateInputType | true
    }
  >

  export interface Task_usersDelegate<GlobalRejectSettings extends Prisma.RejectOnNotFound | Prisma.RejectPerOperation | false | undefined> {
    /**
     * Find zero or one Task_users that matches the filter.
     * @param {Task_usersFindUniqueArgs} args - Arguments to find a Task_users
     * @example
     * // Get one Task_users
     * const task_users = await prisma.task_users.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
    **/
    findUnique<T extends Task_usersFindUniqueArgs,  LocalRejectSettings = T["rejectOnNotFound"] extends RejectOnNotFound ? T['rejectOnNotFound'] : undefined>(
      args: SelectSubset<T, Task_usersFindUniqueArgs>
    ): HasReject<GlobalRejectSettings, LocalRejectSettings, 'findUnique', 'Task_users'> extends True ? Prisma__Task_usersClient<Task_usersGetPayload<T>> : Prisma__Task_usersClient<Task_usersGetPayload<T> | null, null>

    /**
     * Find one Task_users that matches the filter or throw an error  with `error.code='P2025'` 
     *     if no matches were found.
     * @param {Task_usersFindUniqueOrThrowArgs} args - Arguments to find a Task_users
     * @example
     * // Get one Task_users
     * const task_users = await prisma.task_users.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
    **/
    findUniqueOrThrow<T extends Task_usersFindUniqueOrThrowArgs>(
      args?: SelectSubset<T, Task_usersFindUniqueOrThrowArgs>
    ): Prisma__Task_usersClient<Task_usersGetPayload<T>>

    /**
     * Find the first Task_users that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {Task_usersFindFirstArgs} args - Arguments to find a Task_users
     * @example
     * // Get one Task_users
     * const task_users = await prisma.task_users.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
    **/
    findFirst<T extends Task_usersFindFirstArgs,  LocalRejectSettings = T["rejectOnNotFound"] extends RejectOnNotFound ? T['rejectOnNotFound'] : undefined>(
      args?: SelectSubset<T, Task_usersFindFirstArgs>
    ): HasReject<GlobalRejectSettings, LocalRejectSettings, 'findFirst', 'Task_users'> extends True ? Prisma__Task_usersClient<Task_usersGetPayload<T>> : Prisma__Task_usersClient<Task_usersGetPayload<T> | null, null>

    /**
     * Find the first Task_users that matches the filter or
     * throw `NotFoundError` if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {Task_usersFindFirstOrThrowArgs} args - Arguments to find a Task_users
     * @example
     * // Get one Task_users
     * const task_users = await prisma.task_users.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
    **/
    findFirstOrThrow<T extends Task_usersFindFirstOrThrowArgs>(
      args?: SelectSubset<T, Task_usersFindFirstOrThrowArgs>
    ): Prisma__Task_usersClient<Task_usersGetPayload<T>>

    /**
     * Find zero or more Task_users that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {Task_usersFindManyArgs=} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all Task_users
     * const task_users = await prisma.task_users.findMany()
     * 
     * // Get first 10 Task_users
     * const task_users = await prisma.task_users.findMany({ take: 10 })
     * 
     * // Only select the `task_id`
     * const task_usersWithTask_idOnly = await prisma.task_users.findMany({ select: { task_id: true } })
     * 
    **/
    findMany<T extends Task_usersFindManyArgs>(
      args?: SelectSubset<T, Task_usersFindManyArgs>
    ): PrismaPromise<Array<Task_usersGetPayload<T>>>

    /**
     * Create a Task_users.
     * @param {Task_usersCreateArgs} args - Arguments to create a Task_users.
     * @example
     * // Create one Task_users
     * const Task_users = await prisma.task_users.create({
     *   data: {
     *     // ... data to create a Task_users
     *   }
     * })
     * 
    **/
    create<T extends Task_usersCreateArgs>(
      args: SelectSubset<T, Task_usersCreateArgs>
    ): Prisma__Task_usersClient<Task_usersGetPayload<T>>

    /**
     * Create many Task_users.
     *     @param {Task_usersCreateManyArgs} args - Arguments to create many Task_users.
     *     @example
     *     // Create many Task_users
     *     const task_users = await prisma.task_users.createMany({
     *       data: {
     *         // ... provide data here
     *       }
     *     })
     *     
    **/
    createMany<T extends Task_usersCreateManyArgs>(
      args?: SelectSubset<T, Task_usersCreateManyArgs>
    ): PrismaPromise<BatchPayload>

    /**
     * Delete a Task_users.
     * @param {Task_usersDeleteArgs} args - Arguments to delete one Task_users.
     * @example
     * // Delete one Task_users
     * const Task_users = await prisma.task_users.delete({
     *   where: {
     *     // ... filter to delete one Task_users
     *   }
     * })
     * 
    **/
    delete<T extends Task_usersDeleteArgs>(
      args: SelectSubset<T, Task_usersDeleteArgs>
    ): Prisma__Task_usersClient<Task_usersGetPayload<T>>

    /**
     * Update one Task_users.
     * @param {Task_usersUpdateArgs} args - Arguments to update one Task_users.
     * @example
     * // Update one Task_users
     * const task_users = await prisma.task_users.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
    **/
    update<T extends Task_usersUpdateArgs>(
      args: SelectSubset<T, Task_usersUpdateArgs>
    ): Prisma__Task_usersClient<Task_usersGetPayload<T>>

    /**
     * Delete zero or more Task_users.
     * @param {Task_usersDeleteManyArgs} args - Arguments to filter Task_users to delete.
     * @example
     * // Delete a few Task_users
     * const { count } = await prisma.task_users.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     * 
    **/
    deleteMany<T extends Task_usersDeleteManyArgs>(
      args?: SelectSubset<T, Task_usersDeleteManyArgs>
    ): PrismaPromise<BatchPayload>

    /**
     * Update zero or more Task_users.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {Task_usersUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many Task_users
     * const task_users = await prisma.task_users.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
    **/
    updateMany<T extends Task_usersUpdateManyArgs>(
      args: SelectSubset<T, Task_usersUpdateManyArgs>
    ): PrismaPromise<BatchPayload>

    /**
     * Create or update one Task_users.
     * @param {Task_usersUpsertArgs} args - Arguments to update or create a Task_users.
     * @example
     * // Update or create a Task_users
     * const task_users = await prisma.task_users.upsert({
     *   create: {
     *     // ... data to create a Task_users
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the Task_users we want to update
     *   }
     * })
    **/
    upsert<T extends Task_usersUpsertArgs>(
      args: SelectSubset<T, Task_usersUpsertArgs>
    ): Prisma__Task_usersClient<Task_usersGetPayload<T>>

    /**
     * Count the number of Task_users.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {Task_usersCountArgs} args - Arguments to filter Task_users to count.
     * @example
     * // Count the number of Task_users
     * const count = await prisma.task_users.count({
     *   where: {
     *     // ... the filter for the Task_users we want to count
     *   }
     * })
    **/
    count<T extends Task_usersCountArgs>(
      args?: Subset<T, Task_usersCountArgs>,
    ): PrismaPromise<
      T extends _Record<'select', any>
        ? T['select'] extends true
          ? number
          : GetScalarType<T['select'], Task_usersCountAggregateOutputType>
        : number
    >

    /**
     * Allows you to perform aggregations operations on a Task_users.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {Task_usersAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
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
    aggregate<T extends Task_usersAggregateArgs>(args: Subset<T, Task_usersAggregateArgs>): PrismaPromise<GetTask_usersAggregateType<T>>

    /**
     * Group by Task_users.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {Task_usersGroupByArgs} args - Group by arguments.
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
      T extends Task_usersGroupByArgs,
      HasSelectOrTake extends Or<
        Extends<'skip', Keys<T>>,
        Extends<'take', Keys<T>>
      >,
      OrderByArg extends True extends HasSelectOrTake
        ? { orderBy: Task_usersGroupByArgs['orderBy'] }
        : { orderBy?: Task_usersGroupByArgs['orderBy'] },
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
    >(args: SubsetIntersection<T, Task_usersGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetTask_usersGroupByPayload<T> : PrismaPromise<InputErrors>

  }

  /**
   * The delegate class that acts as a "Promise-like" for Task_users.
   * Why is this prefixed with `Prisma__`?
   * Because we want to prevent naming conflicts as mentioned in
   * https://github.com/prisma/prisma-client-js/issues/707
   */
  export class Prisma__Task_usersClient<T, Null = never> implements PrismaPromise<T> {
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

    tasks<T extends TasksArgs= {}>(args?: Subset<T, TasksArgs>): Prisma__TasksClient<TasksGetPayload<T> | Null>;

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
   * Task_users base type for findUnique actions
   */
  export type Task_usersFindUniqueArgsBase = {
    /**
     * Select specific fields to fetch from the Task_users
     * 
    **/
    select?: Task_usersSelect | null
    /**
     * Choose, which related nodes to fetch as well.
     * 
    **/
    include?: Task_usersInclude | null
    /**
     * Filter, which Task_users to fetch.
     * 
    **/
    where: Task_usersWhereUniqueInput
  }

  /**
   * Task_users findUnique
   */
  export interface Task_usersFindUniqueArgs extends Task_usersFindUniqueArgsBase {
   /**
    * Throw an Error if query returns no results
    * @deprecated since 4.0.0: use `findUniqueOrThrow` method instead
    */
    rejectOnNotFound?: RejectOnNotFound
  }
      

  /**
   * Task_users findUniqueOrThrow
   */
  export type Task_usersFindUniqueOrThrowArgs = {
    /**
     * Select specific fields to fetch from the Task_users
     * 
    **/
    select?: Task_usersSelect | null
    /**
     * Choose, which related nodes to fetch as well.
     * 
    **/
    include?: Task_usersInclude | null
    /**
     * Filter, which Task_users to fetch.
     * 
    **/
    where: Task_usersWhereUniqueInput
  }


  /**
   * Task_users base type for findFirst actions
   */
  export type Task_usersFindFirstArgsBase = {
    /**
     * Select specific fields to fetch from the Task_users
     * 
    **/
    select?: Task_usersSelect | null
    /**
     * Choose, which related nodes to fetch as well.
     * 
    **/
    include?: Task_usersInclude | null
    /**
     * Filter, which Task_users to fetch.
     * 
    **/
    where?: Task_usersWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Task_users to fetch.
     * 
    **/
    orderBy?: Enumerable<Task_usersOrderByWithRelationInput>
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for Task_users.
     * 
    **/
    cursor?: Task_usersWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Task_users from the position of the cursor.
     * 
    **/
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Task_users.
     * 
    **/
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of Task_users.
     * 
    **/
    distinct?: Enumerable<Task_usersScalarFieldEnum>
  }

  /**
   * Task_users findFirst
   */
  export interface Task_usersFindFirstArgs extends Task_usersFindFirstArgsBase {
   /**
    * Throw an Error if query returns no results
    * @deprecated since 4.0.0: use `findFirstOrThrow` method instead
    */
    rejectOnNotFound?: RejectOnNotFound
  }
      

  /**
   * Task_users findFirstOrThrow
   */
  export type Task_usersFindFirstOrThrowArgs = {
    /**
     * Select specific fields to fetch from the Task_users
     * 
    **/
    select?: Task_usersSelect | null
    /**
     * Choose, which related nodes to fetch as well.
     * 
    **/
    include?: Task_usersInclude | null
    /**
     * Filter, which Task_users to fetch.
     * 
    **/
    where?: Task_usersWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Task_users to fetch.
     * 
    **/
    orderBy?: Enumerable<Task_usersOrderByWithRelationInput>
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for Task_users.
     * 
    **/
    cursor?: Task_usersWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Task_users from the position of the cursor.
     * 
    **/
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Task_users.
     * 
    **/
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of Task_users.
     * 
    **/
    distinct?: Enumerable<Task_usersScalarFieldEnum>
  }


  /**
   * Task_users findMany
   */
  export type Task_usersFindManyArgs = {
    /**
     * Select specific fields to fetch from the Task_users
     * 
    **/
    select?: Task_usersSelect | null
    /**
     * Choose, which related nodes to fetch as well.
     * 
    **/
    include?: Task_usersInclude | null
    /**
     * Filter, which Task_users to fetch.
     * 
    **/
    where?: Task_usersWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Task_users to fetch.
     * 
    **/
    orderBy?: Enumerable<Task_usersOrderByWithRelationInput>
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for listing Task_users.
     * 
    **/
    cursor?: Task_usersWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Task_users from the position of the cursor.
     * 
    **/
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Task_users.
     * 
    **/
    skip?: number
    distinct?: Enumerable<Task_usersScalarFieldEnum>
  }


  /**
   * Task_users create
   */
  export type Task_usersCreateArgs = {
    /**
     * Select specific fields to fetch from the Task_users
     * 
    **/
    select?: Task_usersSelect | null
    /**
     * Choose, which related nodes to fetch as well.
     * 
    **/
    include?: Task_usersInclude | null
    /**
     * The data needed to create a Task_users.
     * 
    **/
    data: XOR<Task_usersCreateInput, Task_usersUncheckedCreateInput>
  }


  /**
   * Task_users createMany
   */
  export type Task_usersCreateManyArgs = {
    /**
     * The data used to create many Task_users.
     * 
    **/
    data: Enumerable<Task_usersCreateManyInput>
    skipDuplicates?: boolean
  }


  /**
   * Task_users update
   */
  export type Task_usersUpdateArgs = {
    /**
     * Select specific fields to fetch from the Task_users
     * 
    **/
    select?: Task_usersSelect | null
    /**
     * Choose, which related nodes to fetch as well.
     * 
    **/
    include?: Task_usersInclude | null
    /**
     * The data needed to update a Task_users.
     * 
    **/
    data: XOR<Task_usersUpdateInput, Task_usersUncheckedUpdateInput>
    /**
     * Choose, which Task_users to update.
     * 
    **/
    where: Task_usersWhereUniqueInput
  }


  /**
   * Task_users updateMany
   */
  export type Task_usersUpdateManyArgs = {
    /**
     * The data used to update Task_users.
     * 
    **/
    data: XOR<Task_usersUpdateManyMutationInput, Task_usersUncheckedUpdateManyInput>
    /**
     * Filter which Task_users to update
     * 
    **/
    where?: Task_usersWhereInput
  }


  /**
   * Task_users upsert
   */
  export type Task_usersUpsertArgs = {
    /**
     * Select specific fields to fetch from the Task_users
     * 
    **/
    select?: Task_usersSelect | null
    /**
     * Choose, which related nodes to fetch as well.
     * 
    **/
    include?: Task_usersInclude | null
    /**
     * The filter to search for the Task_users to update in case it exists.
     * 
    **/
    where: Task_usersWhereUniqueInput
    /**
     * In case the Task_users found by the `where` argument doesn't exist, create a new Task_users with this data.
     * 
    **/
    create: XOR<Task_usersCreateInput, Task_usersUncheckedCreateInput>
    /**
     * In case the Task_users was found with the provided `where` argument, update it with this data.
     * 
    **/
    update: XOR<Task_usersUpdateInput, Task_usersUncheckedUpdateInput>
  }


  /**
   * Task_users delete
   */
  export type Task_usersDeleteArgs = {
    /**
     * Select specific fields to fetch from the Task_users
     * 
    **/
    select?: Task_usersSelect | null
    /**
     * Choose, which related nodes to fetch as well.
     * 
    **/
    include?: Task_usersInclude | null
    /**
     * Filter which Task_users to delete.
     * 
    **/
    where: Task_usersWhereUniqueInput
  }


  /**
   * Task_users deleteMany
   */
  export type Task_usersDeleteManyArgs = {
    /**
     * Filter which Task_users to delete
     * 
    **/
    where?: Task_usersWhereInput
  }


  /**
   * Task_users without action
   */
  export type Task_usersArgs = {
    /**
     * Select specific fields to fetch from the Task_users
     * 
    **/
    select?: Task_usersSelect | null
    /**
     * Choose, which related nodes to fetch as well.
     * 
    **/
    include?: Task_usersInclude | null
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
    status: number | null
    sort_order: number | null
  }

  export type TasksSumAggregateOutputType = {
    impact: number | null
    status: number | null
    sort_order: number | null
  }

  export type TasksMinAggregateOutputType = {
    id: string | null
    slug: string | null
    markdown: string | null
    summary: string | null
    type: string | null
    impact: number | null
    status: number | null
    project_id: string | null
    created_at: Date | null
    created_by: string | null
    assigned_by: string | null
    assigned_at: Date | null
    modified_at: Date | null
    modified_by: string | null
    sort_order: number | null
  }

  export type TasksMaxAggregateOutputType = {
    id: string | null
    slug: string | null
    markdown: string | null
    summary: string | null
    type: string | null
    impact: number | null
    status: number | null
    project_id: string | null
    created_at: Date | null
    created_by: string | null
    assigned_by: string | null
    assigned_at: Date | null
    modified_at: Date | null
    modified_by: string | null
    sort_order: number | null
  }

  export type TasksCountAggregateOutputType = {
    id: number
    slug: number
    markdown: number
    summary: number
    type: number
    impact: number
    status: number
    project_id: number
    created_at: number
    created_by: number
    assigned_by: number
    assigned_at: number
    modified_at: number
    modified_by: number
    sort_order: number
    _all: number
  }


  export type TasksAvgAggregateInputType = {
    impact?: true
    status?: true
    sort_order?: true
  }

  export type TasksSumAggregateInputType = {
    impact?: true
    status?: true
    sort_order?: true
  }

  export type TasksMinAggregateInputType = {
    id?: true
    slug?: true
    markdown?: true
    summary?: true
    type?: true
    impact?: true
    status?: true
    project_id?: true
    created_at?: true
    created_by?: true
    assigned_by?: true
    assigned_at?: true
    modified_at?: true
    modified_by?: true
    sort_order?: true
  }

  export type TasksMaxAggregateInputType = {
    id?: true
    slug?: true
    markdown?: true
    summary?: true
    type?: true
    impact?: true
    status?: true
    project_id?: true
    created_at?: true
    created_by?: true
    assigned_by?: true
    assigned_at?: true
    modified_at?: true
    modified_by?: true
    sort_order?: true
  }

  export type TasksCountAggregateInputType = {
    id?: true
    slug?: true
    markdown?: true
    summary?: true
    type?: true
    impact?: true
    status?: true
    project_id?: true
    created_at?: true
    created_by?: true
    assigned_by?: true
    assigned_at?: true
    modified_at?: true
    modified_by?: true
    sort_order?: true
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
    status: number
    project_id: string
    created_at: Date
    created_by: string
    assigned_by: string | null
    assigned_at: Date | null
    modified_at: Date | null
    modified_by: string | null
    sort_order: number | null
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
    status?: boolean
    project_id?: boolean
    created_at?: boolean
    created_by?: boolean
    assigned_by?: boolean
    assigned_at?: boolean
    modified_at?: boolean
    modified_by?: boolean
    sort_order?: boolean
    task_labels?: boolean | Tasks$task_labelsArgs
    task_users?: boolean | Tasks$task_usersArgs
    projects?: boolean | ProjectsArgs
    _count?: boolean | TasksCountOutputTypeArgs
  }


  export type TasksInclude = {
    task_labels?: boolean | Tasks$task_labelsArgs
    task_users?: boolean | Tasks$task_usersArgs
    projects?: boolean | ProjectsArgs
    _count?: boolean | TasksCountOutputTypeArgs
  } 

  export type TasksGetPayload<S extends boolean | null | undefined | TasksArgs> =
    S extends { select: any, include: any } ? 'Please either choose `select` or `include`' :
    S extends true ? Tasks :
    S extends undefined ? never :
    S extends { include: any } & (TasksArgs | TasksFindManyArgs)
    ? Tasks  & {
    [P in TruthyKeys<S['include']>]:
        P extends 'task_labels' ? Array < Task_labelsGetPayload<S['include'][P]>>  :
        P extends 'task_users' ? Array < Task_usersGetPayload<S['include'][P]>>  :
        P extends 'projects' ? ProjectsGetPayload<S['include'][P]> :
        P extends '_count' ? TasksCountOutputTypeGetPayload<S['include'][P]> :  never
  } 
    : S extends { select: any } & (TasksArgs | TasksFindManyArgs)
      ? {
    [P in TruthyKeys<S['select']>]:
        P extends 'task_labels' ? Array < Task_labelsGetPayload<S['select'][P]>>  :
        P extends 'task_users' ? Array < Task_usersGetPayload<S['select'][P]>>  :
        P extends 'projects' ? ProjectsGetPayload<S['select'][P]> :
        P extends '_count' ? TasksCountOutputTypeGetPayload<S['select'][P]> :  P extends keyof Tasks ? Tasks[P] : never
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

    task_labels<T extends Tasks$task_labelsArgs= {}>(args?: Subset<T, Tasks$task_labelsArgs>): PrismaPromise<Array<Task_labelsGetPayload<T>>| Null>;

    task_users<T extends Tasks$task_usersArgs= {}>(args?: Subset<T, Tasks$task_usersArgs>): PrismaPromise<Array<Task_usersGetPayload<T>>| Null>;

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
   * Tasks.task_labels
   */
  export type Tasks$task_labelsArgs = {
    /**
     * Select specific fields to fetch from the Task_labels
     * 
    **/
    select?: Task_labelsSelect | null
    /**
     * Choose, which related nodes to fetch as well.
     * 
    **/
    include?: Task_labelsInclude | null
    where?: Task_labelsWhereInput
    orderBy?: Enumerable<Task_labelsOrderByWithRelationInput>
    cursor?: Task_labelsWhereUniqueInput
    take?: number
    skip?: number
    distinct?: Enumerable<Task_labelsScalarFieldEnum>
  }


  /**
   * Tasks.task_users
   */
  export type Tasks$task_usersArgs = {
    /**
     * Select specific fields to fetch from the Task_users
     * 
    **/
    select?: Task_usersSelect | null
    /**
     * Choose, which related nodes to fetch as well.
     * 
    **/
    include?: Task_usersInclude | null
    where?: Task_usersWhereInput
    orderBy?: Enumerable<Task_usersOrderByWithRelationInput>
    cursor?: Task_usersWhereUniqueInput
    take?: number
    skip?: number
    distinct?: Enumerable<Task_usersScalarFieldEnum>
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

  export const LabelsScalarFieldEnum: {
    id: 'id',
    name: 'name',
    color: 'color',
    project_id: 'project_id'
  };

  export type LabelsScalarFieldEnum = (typeof LabelsScalarFieldEnum)[keyof typeof LabelsScalarFieldEnum]


  export const ProjectsScalarFieldEnum: {
    id: 'id',
    slug: 'slug',
    name: 'name',
    color: 'color',
    workspace_id: 'workspace_id',
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


  export const Task_labelsScalarFieldEnum: {
    task_id: 'task_id',
    label_id: 'label_id'
  };

  export type Task_labelsScalarFieldEnum = (typeof Task_labelsScalarFieldEnum)[keyof typeof Task_labelsScalarFieldEnum]


  export const Task_usersScalarFieldEnum: {
    task_id: 'task_id',
    user_id: 'user_id',
    role: 'role'
  };

  export type Task_usersScalarFieldEnum = (typeof Task_usersScalarFieldEnum)[keyof typeof Task_usersScalarFieldEnum]


  export const TasksScalarFieldEnum: {
    id: 'id',
    slug: 'slug',
    markdown: 'markdown',
    summary: 'summary',
    type: 'type',
    impact: 'impact',
    status: 'status',
    project_id: 'project_id',
    created_at: 'created_at',
    created_by: 'created_by',
    assigned_by: 'assigned_by',
    assigned_at: 'assigned_at',
    modified_at: 'modified_at',
    modified_by: 'modified_by',
    sort_order: 'sort_order'
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


  export type LabelsWhereInput = {
    AND?: Enumerable<LabelsWhereInput>
    OR?: Enumerable<LabelsWhereInput>
    NOT?: Enumerable<LabelsWhereInput>
    id?: UuidFilter | string
    name?: StringFilter | string
    color?: StringNullableFilter | string | null
    project_id?: UuidFilter | string
    projects?: XOR<ProjectsRelationFilter, ProjectsWhereInput>
    task_labels?: Task_labelsListRelationFilter
  }

  export type LabelsOrderByWithRelationInput = {
    id?: SortOrder
    name?: SortOrder
    color?: SortOrder
    project_id?: SortOrder
    projects?: ProjectsOrderByWithRelationInput
    task_labels?: Task_labelsOrderByRelationAggregateInput
  }

  export type LabelsWhereUniqueInput = {
    id?: string
  }

  export type LabelsOrderByWithAggregationInput = {
    id?: SortOrder
    name?: SortOrder
    color?: SortOrder
    project_id?: SortOrder
    _count?: LabelsCountOrderByAggregateInput
    _max?: LabelsMaxOrderByAggregateInput
    _min?: LabelsMinOrderByAggregateInput
  }

  export type LabelsScalarWhereWithAggregatesInput = {
    AND?: Enumerable<LabelsScalarWhereWithAggregatesInput>
    OR?: Enumerable<LabelsScalarWhereWithAggregatesInput>
    NOT?: Enumerable<LabelsScalarWhereWithAggregatesInput>
    id?: UuidWithAggregatesFilter | string
    name?: StringWithAggregatesFilter | string
    color?: StringNullableWithAggregatesFilter | string | null
    project_id?: UuidWithAggregatesFilter | string
  }

  export type ProjectsWhereInput = {
    AND?: Enumerable<ProjectsWhereInput>
    OR?: Enumerable<ProjectsWhereInput>
    NOT?: Enumerable<ProjectsWhereInput>
    id?: UuidFilter | string
    slug?: StringFilter | string
    name?: StringFilter | string
    color?: StringFilter | string
    workspace_id?: StringFilter | string
    created_at?: DateTimeFilter | Date | string
    created_by?: StringFilter | string
    modified_at?: DateTimeNullableFilter | Date | string | null
    modified_by?: StringNullableFilter | string | null
    labels?: LabelsListRelationFilter
    tasks?: TasksListRelationFilter
  }

  export type ProjectsOrderByWithRelationInput = {
    id?: SortOrder
    slug?: SortOrder
    name?: SortOrder
    color?: SortOrder
    workspace_id?: SortOrder
    created_at?: SortOrder
    created_by?: SortOrder
    modified_at?: SortOrder
    modified_by?: SortOrder
    labels?: LabelsOrderByRelationAggregateInput
    tasks?: TasksOrderByRelationAggregateInput
  }

  export type ProjectsWhereUniqueInput = {
    id?: string
  }

  export type ProjectsOrderByWithAggregationInput = {
    id?: SortOrder
    slug?: SortOrder
    name?: SortOrder
    color?: SortOrder
    workspace_id?: SortOrder
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
    id?: UuidWithAggregatesFilter | string
    slug?: StringWithAggregatesFilter | string
    name?: StringWithAggregatesFilter | string
    color?: StringWithAggregatesFilter | string
    workspace_id?: StringWithAggregatesFilter | string
    created_at?: DateTimeWithAggregatesFilter | Date | string
    created_by?: StringWithAggregatesFilter | string
    modified_at?: DateTimeNullableWithAggregatesFilter | Date | string | null
    modified_by?: StringNullableWithAggregatesFilter | string | null
  }

  export type Task_labelsWhereInput = {
    AND?: Enumerable<Task_labelsWhereInput>
    OR?: Enumerable<Task_labelsWhereInput>
    NOT?: Enumerable<Task_labelsWhereInput>
    task_id?: UuidFilter | string
    label_id?: UuidFilter | string
    labels?: XOR<LabelsRelationFilter, LabelsWhereInput>
    tasks?: XOR<TasksRelationFilter, TasksWhereInput>
  }

  export type Task_labelsOrderByWithRelationInput = {
    task_id?: SortOrder
    label_id?: SortOrder
    labels?: LabelsOrderByWithRelationInput
    tasks?: TasksOrderByWithRelationInput
  }

  export type Task_labelsWhereUniqueInput = {
    label_id_task_id?: Task_labelsLabel_idTask_idCompoundUniqueInput
  }

  export type Task_labelsOrderByWithAggregationInput = {
    task_id?: SortOrder
    label_id?: SortOrder
    _count?: Task_labelsCountOrderByAggregateInput
    _max?: Task_labelsMaxOrderByAggregateInput
    _min?: Task_labelsMinOrderByAggregateInput
  }

  export type Task_labelsScalarWhereWithAggregatesInput = {
    AND?: Enumerable<Task_labelsScalarWhereWithAggregatesInput>
    OR?: Enumerable<Task_labelsScalarWhereWithAggregatesInput>
    NOT?: Enumerable<Task_labelsScalarWhereWithAggregatesInput>
    task_id?: UuidWithAggregatesFilter | string
    label_id?: UuidWithAggregatesFilter | string
  }

  export type Task_usersWhereInput = {
    AND?: Enumerable<Task_usersWhereInput>
    OR?: Enumerable<Task_usersWhereInput>
    NOT?: Enumerable<Task_usersWhereInput>
    task_id?: UuidFilter | string
    user_id?: UuidFilter | string
    role?: StringFilter | string
    tasks?: XOR<TasksRelationFilter, TasksWhereInput>
  }

  export type Task_usersOrderByWithRelationInput = {
    task_id?: SortOrder
    user_id?: SortOrder
    role?: SortOrder
    tasks?: TasksOrderByWithRelationInput
  }

  export type Task_usersWhereUniqueInput = {
    user_id_task_id?: Task_usersUser_idTask_idCompoundUniqueInput
  }

  export type Task_usersOrderByWithAggregationInput = {
    task_id?: SortOrder
    user_id?: SortOrder
    role?: SortOrder
    _count?: Task_usersCountOrderByAggregateInput
    _max?: Task_usersMaxOrderByAggregateInput
    _min?: Task_usersMinOrderByAggregateInput
  }

  export type Task_usersScalarWhereWithAggregatesInput = {
    AND?: Enumerable<Task_usersScalarWhereWithAggregatesInput>
    OR?: Enumerable<Task_usersScalarWhereWithAggregatesInput>
    NOT?: Enumerable<Task_usersScalarWhereWithAggregatesInput>
    task_id?: UuidWithAggregatesFilter | string
    user_id?: UuidWithAggregatesFilter | string
    role?: StringWithAggregatesFilter | string
  }

  export type TasksWhereInput = {
    AND?: Enumerable<TasksWhereInput>
    OR?: Enumerable<TasksWhereInput>
    NOT?: Enumerable<TasksWhereInput>
    id?: UuidFilter | string
    slug?: StringFilter | string
    markdown?: StringNullableFilter | string | null
    summary?: StringFilter | string
    type?: StringFilter | string
    impact?: IntNullableFilter | number | null
    status?: IntFilter | number
    project_id?: UuidFilter | string
    created_at?: DateTimeFilter | Date | string
    created_by?: StringFilter | string
    assigned_by?: StringNullableFilter | string | null
    assigned_at?: DateTimeNullableFilter | Date | string | null
    modified_at?: DateTimeNullableFilter | Date | string | null
    modified_by?: StringNullableFilter | string | null
    sort_order?: IntNullableFilter | number | null
    task_labels?: Task_labelsListRelationFilter
    task_users?: Task_usersListRelationFilter
    projects?: XOR<ProjectsRelationFilter, ProjectsWhereInput>
  }

  export type TasksOrderByWithRelationInput = {
    id?: SortOrder
    slug?: SortOrder
    markdown?: SortOrder
    summary?: SortOrder
    type?: SortOrder
    impact?: SortOrder
    status?: SortOrder
    project_id?: SortOrder
    created_at?: SortOrder
    created_by?: SortOrder
    assigned_by?: SortOrder
    assigned_at?: SortOrder
    modified_at?: SortOrder
    modified_by?: SortOrder
    sort_order?: SortOrder
    task_labels?: Task_labelsOrderByRelationAggregateInput
    task_users?: Task_usersOrderByRelationAggregateInput
    projects?: ProjectsOrderByWithRelationInput
  }

  export type TasksWhereUniqueInput = {
    id?: string
  }

  export type TasksOrderByWithAggregationInput = {
    id?: SortOrder
    slug?: SortOrder
    markdown?: SortOrder
    summary?: SortOrder
    type?: SortOrder
    impact?: SortOrder
    status?: SortOrder
    project_id?: SortOrder
    created_at?: SortOrder
    created_by?: SortOrder
    assigned_by?: SortOrder
    assigned_at?: SortOrder
    modified_at?: SortOrder
    modified_by?: SortOrder
    sort_order?: SortOrder
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
    id?: UuidWithAggregatesFilter | string
    slug?: StringWithAggregatesFilter | string
    markdown?: StringNullableWithAggregatesFilter | string | null
    summary?: StringWithAggregatesFilter | string
    type?: StringWithAggregatesFilter | string
    impact?: IntNullableWithAggregatesFilter | number | null
    status?: IntWithAggregatesFilter | number
    project_id?: UuidWithAggregatesFilter | string
    created_at?: DateTimeWithAggregatesFilter | Date | string
    created_by?: StringWithAggregatesFilter | string
    assigned_by?: StringNullableWithAggregatesFilter | string | null
    assigned_at?: DateTimeNullableWithAggregatesFilter | Date | string | null
    modified_at?: DateTimeNullableWithAggregatesFilter | Date | string | null
    modified_by?: StringNullableWithAggregatesFilter | string | null
    sort_order?: IntNullableWithAggregatesFilter | number | null
  }

  export type LabelsCreateInput = {
    id: string
    name: string
    color?: string | null
    projects: ProjectsCreateNestedOneWithoutLabelsInput
    task_labels?: Task_labelsCreateNestedManyWithoutLabelsInput
  }

  export type LabelsUncheckedCreateInput = {
    id: string
    name: string
    color?: string | null
    project_id: string
    task_labels?: Task_labelsUncheckedCreateNestedManyWithoutLabelsInput
  }

  export type LabelsUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    color?: NullableStringFieldUpdateOperationsInput | string | null
    projects?: ProjectsUpdateOneRequiredWithoutLabelsNestedInput
    task_labels?: Task_labelsUpdateManyWithoutLabelsNestedInput
  }

  export type LabelsUncheckedUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    color?: NullableStringFieldUpdateOperationsInput | string | null
    project_id?: StringFieldUpdateOperationsInput | string
    task_labels?: Task_labelsUncheckedUpdateManyWithoutLabelsNestedInput
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
  }

  export type LabelsUncheckedUpdateManyInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    color?: NullableStringFieldUpdateOperationsInput | string | null
    project_id?: StringFieldUpdateOperationsInput | string
  }

  export type ProjectsCreateInput = {
    id: string
    slug: string
    name: string
    color: string
    workspace_id: string
    created_at: Date | string
    created_by: string
    modified_at?: Date | string | null
    modified_by?: string | null
    labels?: LabelsCreateNestedManyWithoutProjectsInput
    tasks?: TasksCreateNestedManyWithoutProjectsInput
  }

  export type ProjectsUncheckedCreateInput = {
    id: string
    slug: string
    name: string
    color: string
    workspace_id: string
    created_at: Date | string
    created_by: string
    modified_at?: Date | string | null
    modified_by?: string | null
    labels?: LabelsUncheckedCreateNestedManyWithoutProjectsInput
    tasks?: TasksUncheckedCreateNestedManyWithoutProjectsInput
  }

  export type ProjectsUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    slug?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    color?: StringFieldUpdateOperationsInput | string
    workspace_id?: StringFieldUpdateOperationsInput | string
    created_at?: DateTimeFieldUpdateOperationsInput | Date | string
    created_by?: StringFieldUpdateOperationsInput | string
    modified_at?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    modified_by?: NullableStringFieldUpdateOperationsInput | string | null
    labels?: LabelsUpdateManyWithoutProjectsNestedInput
    tasks?: TasksUpdateManyWithoutProjectsNestedInput
  }

  export type ProjectsUncheckedUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    slug?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    color?: StringFieldUpdateOperationsInput | string
    workspace_id?: StringFieldUpdateOperationsInput | string
    created_at?: DateTimeFieldUpdateOperationsInput | Date | string
    created_by?: StringFieldUpdateOperationsInput | string
    modified_at?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    modified_by?: NullableStringFieldUpdateOperationsInput | string | null
    labels?: LabelsUncheckedUpdateManyWithoutProjectsNestedInput
    tasks?: TasksUncheckedUpdateManyWithoutProjectsNestedInput
  }

  export type ProjectsCreateManyInput = {
    id: string
    slug: string
    name: string
    color: string
    workspace_id: string
    created_at: Date | string
    created_by: string
    modified_at?: Date | string | null
    modified_by?: string | null
  }

  export type ProjectsUpdateManyMutationInput = {
    id?: StringFieldUpdateOperationsInput | string
    slug?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    color?: StringFieldUpdateOperationsInput | string
    workspace_id?: StringFieldUpdateOperationsInput | string
    created_at?: DateTimeFieldUpdateOperationsInput | Date | string
    created_by?: StringFieldUpdateOperationsInput | string
    modified_at?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    modified_by?: NullableStringFieldUpdateOperationsInput | string | null
  }

  export type ProjectsUncheckedUpdateManyInput = {
    id?: StringFieldUpdateOperationsInput | string
    slug?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    color?: StringFieldUpdateOperationsInput | string
    workspace_id?: StringFieldUpdateOperationsInput | string
    created_at?: DateTimeFieldUpdateOperationsInput | Date | string
    created_by?: StringFieldUpdateOperationsInput | string
    modified_at?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    modified_by?: NullableStringFieldUpdateOperationsInput | string | null
  }

  export type Task_labelsCreateInput = {
    labels: LabelsCreateNestedOneWithoutTask_labelsInput
    tasks: TasksCreateNestedOneWithoutTask_labelsInput
  }

  export type Task_labelsUncheckedCreateInput = {
    task_id: string
    label_id: string
  }

  export type Task_labelsUpdateInput = {
    labels?: LabelsUpdateOneRequiredWithoutTask_labelsNestedInput
    tasks?: TasksUpdateOneRequiredWithoutTask_labelsNestedInput
  }

  export type Task_labelsUncheckedUpdateInput = {
    task_id?: StringFieldUpdateOperationsInput | string
    label_id?: StringFieldUpdateOperationsInput | string
  }

  export type Task_labelsCreateManyInput = {
    task_id: string
    label_id: string
  }

  export type Task_labelsUpdateManyMutationInput = {

  }

  export type Task_labelsUncheckedUpdateManyInput = {
    task_id?: StringFieldUpdateOperationsInput | string
    label_id?: StringFieldUpdateOperationsInput | string
  }

  export type Task_usersCreateInput = {
    user_id: string
    role: string
    tasks: TasksCreateNestedOneWithoutTask_usersInput
  }

  export type Task_usersUncheckedCreateInput = {
    task_id: string
    user_id: string
    role: string
  }

  export type Task_usersUpdateInput = {
    user_id?: StringFieldUpdateOperationsInput | string
    role?: StringFieldUpdateOperationsInput | string
    tasks?: TasksUpdateOneRequiredWithoutTask_usersNestedInput
  }

  export type Task_usersUncheckedUpdateInput = {
    task_id?: StringFieldUpdateOperationsInput | string
    user_id?: StringFieldUpdateOperationsInput | string
    role?: StringFieldUpdateOperationsInput | string
  }

  export type Task_usersCreateManyInput = {
    task_id: string
    user_id: string
    role: string
  }

  export type Task_usersUpdateManyMutationInput = {
    user_id?: StringFieldUpdateOperationsInput | string
    role?: StringFieldUpdateOperationsInput | string
  }

  export type Task_usersUncheckedUpdateManyInput = {
    task_id?: StringFieldUpdateOperationsInput | string
    user_id?: StringFieldUpdateOperationsInput | string
    role?: StringFieldUpdateOperationsInput | string
  }

  export type TasksCreateInput = {
    id: string
    slug: string
    markdown?: string | null
    summary: string
    type: string
    impact?: number | null
    status: number
    created_at: Date | string
    created_by: string
    assigned_by?: string | null
    assigned_at?: Date | string | null
    modified_at?: Date | string | null
    modified_by?: string | null
    sort_order?: number | null
    task_labels?: Task_labelsCreateNestedManyWithoutTasksInput
    task_users?: Task_usersCreateNestedManyWithoutTasksInput
    projects: ProjectsCreateNestedOneWithoutTasksInput
  }

  export type TasksUncheckedCreateInput = {
    id: string
    slug: string
    markdown?: string | null
    summary: string
    type: string
    impact?: number | null
    status: number
    project_id: string
    created_at: Date | string
    created_by: string
    assigned_by?: string | null
    assigned_at?: Date | string | null
    modified_at?: Date | string | null
    modified_by?: string | null
    sort_order?: number | null
    task_labels?: Task_labelsUncheckedCreateNestedManyWithoutTasksInput
    task_users?: Task_usersUncheckedCreateNestedManyWithoutTasksInput
  }

  export type TasksUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    slug?: StringFieldUpdateOperationsInput | string
    markdown?: NullableStringFieldUpdateOperationsInput | string | null
    summary?: StringFieldUpdateOperationsInput | string
    type?: StringFieldUpdateOperationsInput | string
    impact?: NullableIntFieldUpdateOperationsInput | number | null
    status?: IntFieldUpdateOperationsInput | number
    created_at?: DateTimeFieldUpdateOperationsInput | Date | string
    created_by?: StringFieldUpdateOperationsInput | string
    assigned_by?: NullableStringFieldUpdateOperationsInput | string | null
    assigned_at?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    modified_at?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    modified_by?: NullableStringFieldUpdateOperationsInput | string | null
    sort_order?: NullableIntFieldUpdateOperationsInput | number | null
    task_labels?: Task_labelsUpdateManyWithoutTasksNestedInput
    task_users?: Task_usersUpdateManyWithoutTasksNestedInput
    projects?: ProjectsUpdateOneRequiredWithoutTasksNestedInput
  }

  export type TasksUncheckedUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    slug?: StringFieldUpdateOperationsInput | string
    markdown?: NullableStringFieldUpdateOperationsInput | string | null
    summary?: StringFieldUpdateOperationsInput | string
    type?: StringFieldUpdateOperationsInput | string
    impact?: NullableIntFieldUpdateOperationsInput | number | null
    status?: IntFieldUpdateOperationsInput | number
    project_id?: StringFieldUpdateOperationsInput | string
    created_at?: DateTimeFieldUpdateOperationsInput | Date | string
    created_by?: StringFieldUpdateOperationsInput | string
    assigned_by?: NullableStringFieldUpdateOperationsInput | string | null
    assigned_at?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    modified_at?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    modified_by?: NullableStringFieldUpdateOperationsInput | string | null
    sort_order?: NullableIntFieldUpdateOperationsInput | number | null
    task_labels?: Task_labelsUncheckedUpdateManyWithoutTasksNestedInput
    task_users?: Task_usersUncheckedUpdateManyWithoutTasksNestedInput
  }

  export type TasksCreateManyInput = {
    id: string
    slug: string
    markdown?: string | null
    summary: string
    type: string
    impact?: number | null
    status: number
    project_id: string
    created_at: Date | string
    created_by: string
    assigned_by?: string | null
    assigned_at?: Date | string | null
    modified_at?: Date | string | null
    modified_by?: string | null
    sort_order?: number | null
  }

  export type TasksUpdateManyMutationInput = {
    id?: StringFieldUpdateOperationsInput | string
    slug?: StringFieldUpdateOperationsInput | string
    markdown?: NullableStringFieldUpdateOperationsInput | string | null
    summary?: StringFieldUpdateOperationsInput | string
    type?: StringFieldUpdateOperationsInput | string
    impact?: NullableIntFieldUpdateOperationsInput | number | null
    status?: IntFieldUpdateOperationsInput | number
    created_at?: DateTimeFieldUpdateOperationsInput | Date | string
    created_by?: StringFieldUpdateOperationsInput | string
    assigned_by?: NullableStringFieldUpdateOperationsInput | string | null
    assigned_at?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    modified_at?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    modified_by?: NullableStringFieldUpdateOperationsInput | string | null
    sort_order?: NullableIntFieldUpdateOperationsInput | number | null
  }

  export type TasksUncheckedUpdateManyInput = {
    id?: StringFieldUpdateOperationsInput | string
    slug?: StringFieldUpdateOperationsInput | string
    markdown?: NullableStringFieldUpdateOperationsInput | string | null
    summary?: StringFieldUpdateOperationsInput | string
    type?: StringFieldUpdateOperationsInput | string
    impact?: NullableIntFieldUpdateOperationsInput | number | null
    status?: IntFieldUpdateOperationsInput | number
    project_id?: StringFieldUpdateOperationsInput | string
    created_at?: DateTimeFieldUpdateOperationsInput | Date | string
    created_by?: StringFieldUpdateOperationsInput | string
    assigned_by?: NullableStringFieldUpdateOperationsInput | string | null
    assigned_at?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    modified_at?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    modified_by?: NullableStringFieldUpdateOperationsInput | string | null
    sort_order?: NullableIntFieldUpdateOperationsInput | number | null
  }

  export type UuidFilter = {
    equals?: string
    in?: Enumerable<string>
    notIn?: Enumerable<string>
    lt?: string
    lte?: string
    gt?: string
    gte?: string
    mode?: QueryMode
    not?: NestedUuidFilter | string
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

  export type ProjectsRelationFilter = {
    is?: ProjectsWhereInput
    isNot?: ProjectsWhereInput
  }

  export type Task_labelsListRelationFilter = {
    every?: Task_labelsWhereInput
    some?: Task_labelsWhereInput
    none?: Task_labelsWhereInput
  }

  export type Task_labelsOrderByRelationAggregateInput = {
    _count?: SortOrder
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

  export type UuidWithAggregatesFilter = {
    equals?: string
    in?: Enumerable<string>
    notIn?: Enumerable<string>
    lt?: string
    lte?: string
    gt?: string
    gte?: string
    mode?: QueryMode
    not?: NestedUuidWithAggregatesFilter | string
    _count?: NestedIntFilter
    _min?: NestedStringFilter
    _max?: NestedStringFilter
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

  export type LabelsListRelationFilter = {
    every?: LabelsWhereInput
    some?: LabelsWhereInput
    none?: LabelsWhereInput
  }

  export type TasksListRelationFilter = {
    every?: TasksWhereInput
    some?: TasksWhereInput
    none?: TasksWhereInput
  }

  export type LabelsOrderByRelationAggregateInput = {
    _count?: SortOrder
  }

  export type TasksOrderByRelationAggregateInput = {
    _count?: SortOrder
  }

  export type ProjectsCountOrderByAggregateInput = {
    id?: SortOrder
    slug?: SortOrder
    name?: SortOrder
    color?: SortOrder
    workspace_id?: SortOrder
    created_at?: SortOrder
    created_by?: SortOrder
    modified_at?: SortOrder
    modified_by?: SortOrder
  }

  export type ProjectsMaxOrderByAggregateInput = {
    id?: SortOrder
    slug?: SortOrder
    name?: SortOrder
    color?: SortOrder
    workspace_id?: SortOrder
    created_at?: SortOrder
    created_by?: SortOrder
    modified_at?: SortOrder
    modified_by?: SortOrder
  }

  export type ProjectsMinOrderByAggregateInput = {
    id?: SortOrder
    slug?: SortOrder
    name?: SortOrder
    color?: SortOrder
    workspace_id?: SortOrder
    created_at?: SortOrder
    created_by?: SortOrder
    modified_at?: SortOrder
    modified_by?: SortOrder
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

  export type LabelsRelationFilter = {
    is?: LabelsWhereInput
    isNot?: LabelsWhereInput
  }

  export type TasksRelationFilter = {
    is?: TasksWhereInput
    isNot?: TasksWhereInput
  }

  export type Task_labelsLabel_idTask_idCompoundUniqueInput = {
    label_id: string
    task_id: string
  }

  export type Task_labelsCountOrderByAggregateInput = {
    task_id?: SortOrder
    label_id?: SortOrder
  }

  export type Task_labelsMaxOrderByAggregateInput = {
    task_id?: SortOrder
    label_id?: SortOrder
  }

  export type Task_labelsMinOrderByAggregateInput = {
    task_id?: SortOrder
    label_id?: SortOrder
  }

  export type Task_usersUser_idTask_idCompoundUniqueInput = {
    user_id: string
    task_id: string
  }

  export type Task_usersCountOrderByAggregateInput = {
    task_id?: SortOrder
    user_id?: SortOrder
    role?: SortOrder
  }

  export type Task_usersMaxOrderByAggregateInput = {
    task_id?: SortOrder
    user_id?: SortOrder
    role?: SortOrder
  }

  export type Task_usersMinOrderByAggregateInput = {
    task_id?: SortOrder
    user_id?: SortOrder
    role?: SortOrder
  }

  export type IntNullableFilter = {
    equals?: number | null
    in?: Enumerable<number> | null
    notIn?: Enumerable<number> | null
    lt?: number
    lte?: number
    gt?: number
    gte?: number
    not?: NestedIntNullableFilter | number | null
  }

  export type IntFilter = {
    equals?: number
    in?: Enumerable<number>
    notIn?: Enumerable<number>
    lt?: number
    lte?: number
    gt?: number
    gte?: number
    not?: NestedIntFilter | number
  }

  export type Task_usersListRelationFilter = {
    every?: Task_usersWhereInput
    some?: Task_usersWhereInput
    none?: Task_usersWhereInput
  }

  export type Task_usersOrderByRelationAggregateInput = {
    _count?: SortOrder
  }

  export type TasksCountOrderByAggregateInput = {
    id?: SortOrder
    slug?: SortOrder
    markdown?: SortOrder
    summary?: SortOrder
    type?: SortOrder
    impact?: SortOrder
    status?: SortOrder
    project_id?: SortOrder
    created_at?: SortOrder
    created_by?: SortOrder
    assigned_by?: SortOrder
    assigned_at?: SortOrder
    modified_at?: SortOrder
    modified_by?: SortOrder
    sort_order?: SortOrder
  }

  export type TasksAvgOrderByAggregateInput = {
    impact?: SortOrder
    status?: SortOrder
    sort_order?: SortOrder
  }

  export type TasksMaxOrderByAggregateInput = {
    id?: SortOrder
    slug?: SortOrder
    markdown?: SortOrder
    summary?: SortOrder
    type?: SortOrder
    impact?: SortOrder
    status?: SortOrder
    project_id?: SortOrder
    created_at?: SortOrder
    created_by?: SortOrder
    assigned_by?: SortOrder
    assigned_at?: SortOrder
    modified_at?: SortOrder
    modified_by?: SortOrder
    sort_order?: SortOrder
  }

  export type TasksMinOrderByAggregateInput = {
    id?: SortOrder
    slug?: SortOrder
    markdown?: SortOrder
    summary?: SortOrder
    type?: SortOrder
    impact?: SortOrder
    status?: SortOrder
    project_id?: SortOrder
    created_at?: SortOrder
    created_by?: SortOrder
    assigned_by?: SortOrder
    assigned_at?: SortOrder
    modified_at?: SortOrder
    modified_by?: SortOrder
    sort_order?: SortOrder
  }

  export type TasksSumOrderByAggregateInput = {
    impact?: SortOrder
    status?: SortOrder
    sort_order?: SortOrder
  }

  export type IntNullableWithAggregatesFilter = {
    equals?: number | null
    in?: Enumerable<number> | null
    notIn?: Enumerable<number> | null
    lt?: number
    lte?: number
    gt?: number
    gte?: number
    not?: NestedIntNullableWithAggregatesFilter | number | null
    _count?: NestedIntNullableFilter
    _avg?: NestedFloatNullableFilter
    _sum?: NestedIntNullableFilter
    _min?: NestedIntNullableFilter
    _max?: NestedIntNullableFilter
  }

  export type IntWithAggregatesFilter = {
    equals?: number
    in?: Enumerable<number>
    notIn?: Enumerable<number>
    lt?: number
    lte?: number
    gt?: number
    gte?: number
    not?: NestedIntWithAggregatesFilter | number
    _count?: NestedIntFilter
    _avg?: NestedFloatFilter
    _sum?: NestedIntFilter
    _min?: NestedIntFilter
    _max?: NestedIntFilter
  }

  export type ProjectsCreateNestedOneWithoutLabelsInput = {
    create?: XOR<ProjectsCreateWithoutLabelsInput, ProjectsUncheckedCreateWithoutLabelsInput>
    connectOrCreate?: ProjectsCreateOrConnectWithoutLabelsInput
    connect?: ProjectsWhereUniqueInput
  }

  export type Task_labelsCreateNestedManyWithoutLabelsInput = {
    create?: XOR<Enumerable<Task_labelsCreateWithoutLabelsInput>, Enumerable<Task_labelsUncheckedCreateWithoutLabelsInput>>
    connectOrCreate?: Enumerable<Task_labelsCreateOrConnectWithoutLabelsInput>
    createMany?: Task_labelsCreateManyLabelsInputEnvelope
    connect?: Enumerable<Task_labelsWhereUniqueInput>
  }

  export type Task_labelsUncheckedCreateNestedManyWithoutLabelsInput = {
    create?: XOR<Enumerable<Task_labelsCreateWithoutLabelsInput>, Enumerable<Task_labelsUncheckedCreateWithoutLabelsInput>>
    connectOrCreate?: Enumerable<Task_labelsCreateOrConnectWithoutLabelsInput>
    createMany?: Task_labelsCreateManyLabelsInputEnvelope
    connect?: Enumerable<Task_labelsWhereUniqueInput>
  }

  export type StringFieldUpdateOperationsInput = {
    set?: string
  }

  export type NullableStringFieldUpdateOperationsInput = {
    set?: string | null
  }

  export type ProjectsUpdateOneRequiredWithoutLabelsNestedInput = {
    create?: XOR<ProjectsCreateWithoutLabelsInput, ProjectsUncheckedCreateWithoutLabelsInput>
    connectOrCreate?: ProjectsCreateOrConnectWithoutLabelsInput
    upsert?: ProjectsUpsertWithoutLabelsInput
    connect?: ProjectsWhereUniqueInput
    update?: XOR<ProjectsUpdateWithoutLabelsInput, ProjectsUncheckedUpdateWithoutLabelsInput>
  }

  export type Task_labelsUpdateManyWithoutLabelsNestedInput = {
    create?: XOR<Enumerable<Task_labelsCreateWithoutLabelsInput>, Enumerable<Task_labelsUncheckedCreateWithoutLabelsInput>>
    connectOrCreate?: Enumerable<Task_labelsCreateOrConnectWithoutLabelsInput>
    upsert?: Enumerable<Task_labelsUpsertWithWhereUniqueWithoutLabelsInput>
    createMany?: Task_labelsCreateManyLabelsInputEnvelope
    set?: Enumerable<Task_labelsWhereUniqueInput>
    disconnect?: Enumerable<Task_labelsWhereUniqueInput>
    delete?: Enumerable<Task_labelsWhereUniqueInput>
    connect?: Enumerable<Task_labelsWhereUniqueInput>
    update?: Enumerable<Task_labelsUpdateWithWhereUniqueWithoutLabelsInput>
    updateMany?: Enumerable<Task_labelsUpdateManyWithWhereWithoutLabelsInput>
    deleteMany?: Enumerable<Task_labelsScalarWhereInput>
  }

  export type Task_labelsUncheckedUpdateManyWithoutLabelsNestedInput = {
    create?: XOR<Enumerable<Task_labelsCreateWithoutLabelsInput>, Enumerable<Task_labelsUncheckedCreateWithoutLabelsInput>>
    connectOrCreate?: Enumerable<Task_labelsCreateOrConnectWithoutLabelsInput>
    upsert?: Enumerable<Task_labelsUpsertWithWhereUniqueWithoutLabelsInput>
    createMany?: Task_labelsCreateManyLabelsInputEnvelope
    set?: Enumerable<Task_labelsWhereUniqueInput>
    disconnect?: Enumerable<Task_labelsWhereUniqueInput>
    delete?: Enumerable<Task_labelsWhereUniqueInput>
    connect?: Enumerable<Task_labelsWhereUniqueInput>
    update?: Enumerable<Task_labelsUpdateWithWhereUniqueWithoutLabelsInput>
    updateMany?: Enumerable<Task_labelsUpdateManyWithWhereWithoutLabelsInput>
    deleteMany?: Enumerable<Task_labelsScalarWhereInput>
  }

  export type LabelsCreateNestedManyWithoutProjectsInput = {
    create?: XOR<Enumerable<LabelsCreateWithoutProjectsInput>, Enumerable<LabelsUncheckedCreateWithoutProjectsInput>>
    connectOrCreate?: Enumerable<LabelsCreateOrConnectWithoutProjectsInput>
    createMany?: LabelsCreateManyProjectsInputEnvelope
    connect?: Enumerable<LabelsWhereUniqueInput>
  }

  export type TasksCreateNestedManyWithoutProjectsInput = {
    create?: XOR<Enumerable<TasksCreateWithoutProjectsInput>, Enumerable<TasksUncheckedCreateWithoutProjectsInput>>
    connectOrCreate?: Enumerable<TasksCreateOrConnectWithoutProjectsInput>
    createMany?: TasksCreateManyProjectsInputEnvelope
    connect?: Enumerable<TasksWhereUniqueInput>
  }

  export type LabelsUncheckedCreateNestedManyWithoutProjectsInput = {
    create?: XOR<Enumerable<LabelsCreateWithoutProjectsInput>, Enumerable<LabelsUncheckedCreateWithoutProjectsInput>>
    connectOrCreate?: Enumerable<LabelsCreateOrConnectWithoutProjectsInput>
    createMany?: LabelsCreateManyProjectsInputEnvelope
    connect?: Enumerable<LabelsWhereUniqueInput>
  }

  export type TasksUncheckedCreateNestedManyWithoutProjectsInput = {
    create?: XOR<Enumerable<TasksCreateWithoutProjectsInput>, Enumerable<TasksUncheckedCreateWithoutProjectsInput>>
    connectOrCreate?: Enumerable<TasksCreateOrConnectWithoutProjectsInput>
    createMany?: TasksCreateManyProjectsInputEnvelope
    connect?: Enumerable<TasksWhereUniqueInput>
  }

  export type DateTimeFieldUpdateOperationsInput = {
    set?: Date | string
  }

  export type NullableDateTimeFieldUpdateOperationsInput = {
    set?: Date | string | null
  }

  export type LabelsUpdateManyWithoutProjectsNestedInput = {
    create?: XOR<Enumerable<LabelsCreateWithoutProjectsInput>, Enumerable<LabelsUncheckedCreateWithoutProjectsInput>>
    connectOrCreate?: Enumerable<LabelsCreateOrConnectWithoutProjectsInput>
    upsert?: Enumerable<LabelsUpsertWithWhereUniqueWithoutProjectsInput>
    createMany?: LabelsCreateManyProjectsInputEnvelope
    set?: Enumerable<LabelsWhereUniqueInput>
    disconnect?: Enumerable<LabelsWhereUniqueInput>
    delete?: Enumerable<LabelsWhereUniqueInput>
    connect?: Enumerable<LabelsWhereUniqueInput>
    update?: Enumerable<LabelsUpdateWithWhereUniqueWithoutProjectsInput>
    updateMany?: Enumerable<LabelsUpdateManyWithWhereWithoutProjectsInput>
    deleteMany?: Enumerable<LabelsScalarWhereInput>
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

  export type LabelsUncheckedUpdateManyWithoutProjectsNestedInput = {
    create?: XOR<Enumerable<LabelsCreateWithoutProjectsInput>, Enumerable<LabelsUncheckedCreateWithoutProjectsInput>>
    connectOrCreate?: Enumerable<LabelsCreateOrConnectWithoutProjectsInput>
    upsert?: Enumerable<LabelsUpsertWithWhereUniqueWithoutProjectsInput>
    createMany?: LabelsCreateManyProjectsInputEnvelope
    set?: Enumerable<LabelsWhereUniqueInput>
    disconnect?: Enumerable<LabelsWhereUniqueInput>
    delete?: Enumerable<LabelsWhereUniqueInput>
    connect?: Enumerable<LabelsWhereUniqueInput>
    update?: Enumerable<LabelsUpdateWithWhereUniqueWithoutProjectsInput>
    updateMany?: Enumerable<LabelsUpdateManyWithWhereWithoutProjectsInput>
    deleteMany?: Enumerable<LabelsScalarWhereInput>
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

  export type LabelsCreateNestedOneWithoutTask_labelsInput = {
    create?: XOR<LabelsCreateWithoutTask_labelsInput, LabelsUncheckedCreateWithoutTask_labelsInput>
    connectOrCreate?: LabelsCreateOrConnectWithoutTask_labelsInput
    connect?: LabelsWhereUniqueInput
  }

  export type TasksCreateNestedOneWithoutTask_labelsInput = {
    create?: XOR<TasksCreateWithoutTask_labelsInput, TasksUncheckedCreateWithoutTask_labelsInput>
    connectOrCreate?: TasksCreateOrConnectWithoutTask_labelsInput
    connect?: TasksWhereUniqueInput
  }

  export type LabelsUpdateOneRequiredWithoutTask_labelsNestedInput = {
    create?: XOR<LabelsCreateWithoutTask_labelsInput, LabelsUncheckedCreateWithoutTask_labelsInput>
    connectOrCreate?: LabelsCreateOrConnectWithoutTask_labelsInput
    upsert?: LabelsUpsertWithoutTask_labelsInput
    connect?: LabelsWhereUniqueInput
    update?: XOR<LabelsUpdateWithoutTask_labelsInput, LabelsUncheckedUpdateWithoutTask_labelsInput>
  }

  export type TasksUpdateOneRequiredWithoutTask_labelsNestedInput = {
    create?: XOR<TasksCreateWithoutTask_labelsInput, TasksUncheckedCreateWithoutTask_labelsInput>
    connectOrCreate?: TasksCreateOrConnectWithoutTask_labelsInput
    upsert?: TasksUpsertWithoutTask_labelsInput
    connect?: TasksWhereUniqueInput
    update?: XOR<TasksUpdateWithoutTask_labelsInput, TasksUncheckedUpdateWithoutTask_labelsInput>
  }

  export type TasksCreateNestedOneWithoutTask_usersInput = {
    create?: XOR<TasksCreateWithoutTask_usersInput, TasksUncheckedCreateWithoutTask_usersInput>
    connectOrCreate?: TasksCreateOrConnectWithoutTask_usersInput
    connect?: TasksWhereUniqueInput
  }

  export type TasksUpdateOneRequiredWithoutTask_usersNestedInput = {
    create?: XOR<TasksCreateWithoutTask_usersInput, TasksUncheckedCreateWithoutTask_usersInput>
    connectOrCreate?: TasksCreateOrConnectWithoutTask_usersInput
    upsert?: TasksUpsertWithoutTask_usersInput
    connect?: TasksWhereUniqueInput
    update?: XOR<TasksUpdateWithoutTask_usersInput, TasksUncheckedUpdateWithoutTask_usersInput>
  }

  export type Task_labelsCreateNestedManyWithoutTasksInput = {
    create?: XOR<Enumerable<Task_labelsCreateWithoutTasksInput>, Enumerable<Task_labelsUncheckedCreateWithoutTasksInput>>
    connectOrCreate?: Enumerable<Task_labelsCreateOrConnectWithoutTasksInput>
    createMany?: Task_labelsCreateManyTasksInputEnvelope
    connect?: Enumerable<Task_labelsWhereUniqueInput>
  }

  export type Task_usersCreateNestedManyWithoutTasksInput = {
    create?: XOR<Enumerable<Task_usersCreateWithoutTasksInput>, Enumerable<Task_usersUncheckedCreateWithoutTasksInput>>
    connectOrCreate?: Enumerable<Task_usersCreateOrConnectWithoutTasksInput>
    createMany?: Task_usersCreateManyTasksInputEnvelope
    connect?: Enumerable<Task_usersWhereUniqueInput>
  }

  export type ProjectsCreateNestedOneWithoutTasksInput = {
    create?: XOR<ProjectsCreateWithoutTasksInput, ProjectsUncheckedCreateWithoutTasksInput>
    connectOrCreate?: ProjectsCreateOrConnectWithoutTasksInput
    connect?: ProjectsWhereUniqueInput
  }

  export type Task_labelsUncheckedCreateNestedManyWithoutTasksInput = {
    create?: XOR<Enumerable<Task_labelsCreateWithoutTasksInput>, Enumerable<Task_labelsUncheckedCreateWithoutTasksInput>>
    connectOrCreate?: Enumerable<Task_labelsCreateOrConnectWithoutTasksInput>
    createMany?: Task_labelsCreateManyTasksInputEnvelope
    connect?: Enumerable<Task_labelsWhereUniqueInput>
  }

  export type Task_usersUncheckedCreateNestedManyWithoutTasksInput = {
    create?: XOR<Enumerable<Task_usersCreateWithoutTasksInput>, Enumerable<Task_usersUncheckedCreateWithoutTasksInput>>
    connectOrCreate?: Enumerable<Task_usersCreateOrConnectWithoutTasksInput>
    createMany?: Task_usersCreateManyTasksInputEnvelope
    connect?: Enumerable<Task_usersWhereUniqueInput>
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

  export type Task_labelsUpdateManyWithoutTasksNestedInput = {
    create?: XOR<Enumerable<Task_labelsCreateWithoutTasksInput>, Enumerable<Task_labelsUncheckedCreateWithoutTasksInput>>
    connectOrCreate?: Enumerable<Task_labelsCreateOrConnectWithoutTasksInput>
    upsert?: Enumerable<Task_labelsUpsertWithWhereUniqueWithoutTasksInput>
    createMany?: Task_labelsCreateManyTasksInputEnvelope
    set?: Enumerable<Task_labelsWhereUniqueInput>
    disconnect?: Enumerable<Task_labelsWhereUniqueInput>
    delete?: Enumerable<Task_labelsWhereUniqueInput>
    connect?: Enumerable<Task_labelsWhereUniqueInput>
    update?: Enumerable<Task_labelsUpdateWithWhereUniqueWithoutTasksInput>
    updateMany?: Enumerable<Task_labelsUpdateManyWithWhereWithoutTasksInput>
    deleteMany?: Enumerable<Task_labelsScalarWhereInput>
  }

  export type Task_usersUpdateManyWithoutTasksNestedInput = {
    create?: XOR<Enumerable<Task_usersCreateWithoutTasksInput>, Enumerable<Task_usersUncheckedCreateWithoutTasksInput>>
    connectOrCreate?: Enumerable<Task_usersCreateOrConnectWithoutTasksInput>
    upsert?: Enumerable<Task_usersUpsertWithWhereUniqueWithoutTasksInput>
    createMany?: Task_usersCreateManyTasksInputEnvelope
    set?: Enumerable<Task_usersWhereUniqueInput>
    disconnect?: Enumerable<Task_usersWhereUniqueInput>
    delete?: Enumerable<Task_usersWhereUniqueInput>
    connect?: Enumerable<Task_usersWhereUniqueInput>
    update?: Enumerable<Task_usersUpdateWithWhereUniqueWithoutTasksInput>
    updateMany?: Enumerable<Task_usersUpdateManyWithWhereWithoutTasksInput>
    deleteMany?: Enumerable<Task_usersScalarWhereInput>
  }

  export type ProjectsUpdateOneRequiredWithoutTasksNestedInput = {
    create?: XOR<ProjectsCreateWithoutTasksInput, ProjectsUncheckedCreateWithoutTasksInput>
    connectOrCreate?: ProjectsCreateOrConnectWithoutTasksInput
    upsert?: ProjectsUpsertWithoutTasksInput
    connect?: ProjectsWhereUniqueInput
    update?: XOR<ProjectsUpdateWithoutTasksInput, ProjectsUncheckedUpdateWithoutTasksInput>
  }

  export type Task_labelsUncheckedUpdateManyWithoutTasksNestedInput = {
    create?: XOR<Enumerable<Task_labelsCreateWithoutTasksInput>, Enumerable<Task_labelsUncheckedCreateWithoutTasksInput>>
    connectOrCreate?: Enumerable<Task_labelsCreateOrConnectWithoutTasksInput>
    upsert?: Enumerable<Task_labelsUpsertWithWhereUniqueWithoutTasksInput>
    createMany?: Task_labelsCreateManyTasksInputEnvelope
    set?: Enumerable<Task_labelsWhereUniqueInput>
    disconnect?: Enumerable<Task_labelsWhereUniqueInput>
    delete?: Enumerable<Task_labelsWhereUniqueInput>
    connect?: Enumerable<Task_labelsWhereUniqueInput>
    update?: Enumerable<Task_labelsUpdateWithWhereUniqueWithoutTasksInput>
    updateMany?: Enumerable<Task_labelsUpdateManyWithWhereWithoutTasksInput>
    deleteMany?: Enumerable<Task_labelsScalarWhereInput>
  }

  export type Task_usersUncheckedUpdateManyWithoutTasksNestedInput = {
    create?: XOR<Enumerable<Task_usersCreateWithoutTasksInput>, Enumerable<Task_usersUncheckedCreateWithoutTasksInput>>
    connectOrCreate?: Enumerable<Task_usersCreateOrConnectWithoutTasksInput>
    upsert?: Enumerable<Task_usersUpsertWithWhereUniqueWithoutTasksInput>
    createMany?: Task_usersCreateManyTasksInputEnvelope
    set?: Enumerable<Task_usersWhereUniqueInput>
    disconnect?: Enumerable<Task_usersWhereUniqueInput>
    delete?: Enumerable<Task_usersWhereUniqueInput>
    connect?: Enumerable<Task_usersWhereUniqueInput>
    update?: Enumerable<Task_usersUpdateWithWhereUniqueWithoutTasksInput>
    updateMany?: Enumerable<Task_usersUpdateManyWithWhereWithoutTasksInput>
    deleteMany?: Enumerable<Task_usersScalarWhereInput>
  }

  export type NestedUuidFilter = {
    equals?: string
    in?: Enumerable<string>
    notIn?: Enumerable<string>
    lt?: string
    lte?: string
    gt?: string
    gte?: string
    not?: NestedUuidFilter | string
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

  export type NestedUuidWithAggregatesFilter = {
    equals?: string
    in?: Enumerable<string>
    notIn?: Enumerable<string>
    lt?: string
    lte?: string
    gt?: string
    gte?: string
    not?: NestedUuidWithAggregatesFilter | string
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

  export type NestedIntNullableWithAggregatesFilter = {
    equals?: number | null
    in?: Enumerable<number> | null
    notIn?: Enumerable<number> | null
    lt?: number
    lte?: number
    gt?: number
    gte?: number
    not?: NestedIntNullableWithAggregatesFilter | number | null
    _count?: NestedIntNullableFilter
    _avg?: NestedFloatNullableFilter
    _sum?: NestedIntNullableFilter
    _min?: NestedIntNullableFilter
    _max?: NestedIntNullableFilter
  }

  export type NestedFloatNullableFilter = {
    equals?: number | null
    in?: Enumerable<number> | null
    notIn?: Enumerable<number> | null
    lt?: number
    lte?: number
    gt?: number
    gte?: number
    not?: NestedFloatNullableFilter | number | null
  }

  export type NestedIntWithAggregatesFilter = {
    equals?: number
    in?: Enumerable<number>
    notIn?: Enumerable<number>
    lt?: number
    lte?: number
    gt?: number
    gte?: number
    not?: NestedIntWithAggregatesFilter | number
    _count?: NestedIntFilter
    _avg?: NestedFloatFilter
    _sum?: NestedIntFilter
    _min?: NestedIntFilter
    _max?: NestedIntFilter
  }

  export type NestedFloatFilter = {
    equals?: number
    in?: Enumerable<number>
    notIn?: Enumerable<number>
    lt?: number
    lte?: number
    gt?: number
    gte?: number
    not?: NestedFloatFilter | number
  }

  export type ProjectsCreateWithoutLabelsInput = {
    id: string
    slug: string
    name: string
    color: string
    workspace_id: string
    created_at: Date | string
    created_by: string
    modified_at?: Date | string | null
    modified_by?: string | null
    tasks?: TasksCreateNestedManyWithoutProjectsInput
  }

  export type ProjectsUncheckedCreateWithoutLabelsInput = {
    id: string
    slug: string
    name: string
    color: string
    workspace_id: string
    created_at: Date | string
    created_by: string
    modified_at?: Date | string | null
    modified_by?: string | null
    tasks?: TasksUncheckedCreateNestedManyWithoutProjectsInput
  }

  export type ProjectsCreateOrConnectWithoutLabelsInput = {
    where: ProjectsWhereUniqueInput
    create: XOR<ProjectsCreateWithoutLabelsInput, ProjectsUncheckedCreateWithoutLabelsInput>
  }

  export type Task_labelsCreateWithoutLabelsInput = {
    tasks: TasksCreateNestedOneWithoutTask_labelsInput
  }

  export type Task_labelsUncheckedCreateWithoutLabelsInput = {
    task_id: string
  }

  export type Task_labelsCreateOrConnectWithoutLabelsInput = {
    where: Task_labelsWhereUniqueInput
    create: XOR<Task_labelsCreateWithoutLabelsInput, Task_labelsUncheckedCreateWithoutLabelsInput>
  }

  export type Task_labelsCreateManyLabelsInputEnvelope = {
    data: Enumerable<Task_labelsCreateManyLabelsInput>
    skipDuplicates?: boolean
  }

  export type ProjectsUpsertWithoutLabelsInput = {
    update: XOR<ProjectsUpdateWithoutLabelsInput, ProjectsUncheckedUpdateWithoutLabelsInput>
    create: XOR<ProjectsCreateWithoutLabelsInput, ProjectsUncheckedCreateWithoutLabelsInput>
  }

  export type ProjectsUpdateWithoutLabelsInput = {
    id?: StringFieldUpdateOperationsInput | string
    slug?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    color?: StringFieldUpdateOperationsInput | string
    workspace_id?: StringFieldUpdateOperationsInput | string
    created_at?: DateTimeFieldUpdateOperationsInput | Date | string
    created_by?: StringFieldUpdateOperationsInput | string
    modified_at?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    modified_by?: NullableStringFieldUpdateOperationsInput | string | null
    tasks?: TasksUpdateManyWithoutProjectsNestedInput
  }

  export type ProjectsUncheckedUpdateWithoutLabelsInput = {
    id?: StringFieldUpdateOperationsInput | string
    slug?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    color?: StringFieldUpdateOperationsInput | string
    workspace_id?: StringFieldUpdateOperationsInput | string
    created_at?: DateTimeFieldUpdateOperationsInput | Date | string
    created_by?: StringFieldUpdateOperationsInput | string
    modified_at?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    modified_by?: NullableStringFieldUpdateOperationsInput | string | null
    tasks?: TasksUncheckedUpdateManyWithoutProjectsNestedInput
  }

  export type Task_labelsUpsertWithWhereUniqueWithoutLabelsInput = {
    where: Task_labelsWhereUniqueInput
    update: XOR<Task_labelsUpdateWithoutLabelsInput, Task_labelsUncheckedUpdateWithoutLabelsInput>
    create: XOR<Task_labelsCreateWithoutLabelsInput, Task_labelsUncheckedCreateWithoutLabelsInput>
  }

  export type Task_labelsUpdateWithWhereUniqueWithoutLabelsInput = {
    where: Task_labelsWhereUniqueInput
    data: XOR<Task_labelsUpdateWithoutLabelsInput, Task_labelsUncheckedUpdateWithoutLabelsInput>
  }

  export type Task_labelsUpdateManyWithWhereWithoutLabelsInput = {
    where: Task_labelsScalarWhereInput
    data: XOR<Task_labelsUpdateManyMutationInput, Task_labelsUncheckedUpdateManyWithoutTask_labelsInput>
  }

  export type Task_labelsScalarWhereInput = {
    AND?: Enumerable<Task_labelsScalarWhereInput>
    OR?: Enumerable<Task_labelsScalarWhereInput>
    NOT?: Enumerable<Task_labelsScalarWhereInput>
    task_id?: UuidFilter | string
    label_id?: UuidFilter | string
  }

  export type LabelsCreateWithoutProjectsInput = {
    id: string
    name: string
    color?: string | null
    task_labels?: Task_labelsCreateNestedManyWithoutLabelsInput
  }

  export type LabelsUncheckedCreateWithoutProjectsInput = {
    id: string
    name: string
    color?: string | null
    task_labels?: Task_labelsUncheckedCreateNestedManyWithoutLabelsInput
  }

  export type LabelsCreateOrConnectWithoutProjectsInput = {
    where: LabelsWhereUniqueInput
    create: XOR<LabelsCreateWithoutProjectsInput, LabelsUncheckedCreateWithoutProjectsInput>
  }

  export type LabelsCreateManyProjectsInputEnvelope = {
    data: Enumerable<LabelsCreateManyProjectsInput>
    skipDuplicates?: boolean
  }

  export type TasksCreateWithoutProjectsInput = {
    id: string
    slug: string
    markdown?: string | null
    summary: string
    type: string
    impact?: number | null
    status: number
    created_at: Date | string
    created_by: string
    assigned_by?: string | null
    assigned_at?: Date | string | null
    modified_at?: Date | string | null
    modified_by?: string | null
    sort_order?: number | null
    task_labels?: Task_labelsCreateNestedManyWithoutTasksInput
    task_users?: Task_usersCreateNestedManyWithoutTasksInput
  }

  export type TasksUncheckedCreateWithoutProjectsInput = {
    id: string
    slug: string
    markdown?: string | null
    summary: string
    type: string
    impact?: number | null
    status: number
    created_at: Date | string
    created_by: string
    assigned_by?: string | null
    assigned_at?: Date | string | null
    modified_at?: Date | string | null
    modified_by?: string | null
    sort_order?: number | null
    task_labels?: Task_labelsUncheckedCreateNestedManyWithoutTasksInput
    task_users?: Task_usersUncheckedCreateNestedManyWithoutTasksInput
  }

  export type TasksCreateOrConnectWithoutProjectsInput = {
    where: TasksWhereUniqueInput
    create: XOR<TasksCreateWithoutProjectsInput, TasksUncheckedCreateWithoutProjectsInput>
  }

  export type TasksCreateManyProjectsInputEnvelope = {
    data: Enumerable<TasksCreateManyProjectsInput>
    skipDuplicates?: boolean
  }

  export type LabelsUpsertWithWhereUniqueWithoutProjectsInput = {
    where: LabelsWhereUniqueInput
    update: XOR<LabelsUpdateWithoutProjectsInput, LabelsUncheckedUpdateWithoutProjectsInput>
    create: XOR<LabelsCreateWithoutProjectsInput, LabelsUncheckedCreateWithoutProjectsInput>
  }

  export type LabelsUpdateWithWhereUniqueWithoutProjectsInput = {
    where: LabelsWhereUniqueInput
    data: XOR<LabelsUpdateWithoutProjectsInput, LabelsUncheckedUpdateWithoutProjectsInput>
  }

  export type LabelsUpdateManyWithWhereWithoutProjectsInput = {
    where: LabelsScalarWhereInput
    data: XOR<LabelsUpdateManyMutationInput, LabelsUncheckedUpdateManyWithoutLabelsInput>
  }

  export type LabelsScalarWhereInput = {
    AND?: Enumerable<LabelsScalarWhereInput>
    OR?: Enumerable<LabelsScalarWhereInput>
    NOT?: Enumerable<LabelsScalarWhereInput>
    id?: UuidFilter | string
    name?: StringFilter | string
    color?: StringNullableFilter | string | null
    project_id?: UuidFilter | string
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
    id?: UuidFilter | string
    slug?: StringFilter | string
    markdown?: StringNullableFilter | string | null
    summary?: StringFilter | string
    type?: StringFilter | string
    impact?: IntNullableFilter | number | null
    status?: IntFilter | number
    project_id?: UuidFilter | string
    created_at?: DateTimeFilter | Date | string
    created_by?: StringFilter | string
    assigned_by?: StringNullableFilter | string | null
    assigned_at?: DateTimeNullableFilter | Date | string | null
    modified_at?: DateTimeNullableFilter | Date | string | null
    modified_by?: StringNullableFilter | string | null
    sort_order?: IntNullableFilter | number | null
  }

  export type LabelsCreateWithoutTask_labelsInput = {
    id: string
    name: string
    color?: string | null
    projects: ProjectsCreateNestedOneWithoutLabelsInput
  }

  export type LabelsUncheckedCreateWithoutTask_labelsInput = {
    id: string
    name: string
    color?: string | null
    project_id: string
  }

  export type LabelsCreateOrConnectWithoutTask_labelsInput = {
    where: LabelsWhereUniqueInput
    create: XOR<LabelsCreateWithoutTask_labelsInput, LabelsUncheckedCreateWithoutTask_labelsInput>
  }

  export type TasksCreateWithoutTask_labelsInput = {
    id: string
    slug: string
    markdown?: string | null
    summary: string
    type: string
    impact?: number | null
    status: number
    created_at: Date | string
    created_by: string
    assigned_by?: string | null
    assigned_at?: Date | string | null
    modified_at?: Date | string | null
    modified_by?: string | null
    sort_order?: number | null
    task_users?: Task_usersCreateNestedManyWithoutTasksInput
    projects: ProjectsCreateNestedOneWithoutTasksInput
  }

  export type TasksUncheckedCreateWithoutTask_labelsInput = {
    id: string
    slug: string
    markdown?: string | null
    summary: string
    type: string
    impact?: number | null
    status: number
    project_id: string
    created_at: Date | string
    created_by: string
    assigned_by?: string | null
    assigned_at?: Date | string | null
    modified_at?: Date | string | null
    modified_by?: string | null
    sort_order?: number | null
    task_users?: Task_usersUncheckedCreateNestedManyWithoutTasksInput
  }

  export type TasksCreateOrConnectWithoutTask_labelsInput = {
    where: TasksWhereUniqueInput
    create: XOR<TasksCreateWithoutTask_labelsInput, TasksUncheckedCreateWithoutTask_labelsInput>
  }

  export type LabelsUpsertWithoutTask_labelsInput = {
    update: XOR<LabelsUpdateWithoutTask_labelsInput, LabelsUncheckedUpdateWithoutTask_labelsInput>
    create: XOR<LabelsCreateWithoutTask_labelsInput, LabelsUncheckedCreateWithoutTask_labelsInput>
  }

  export type LabelsUpdateWithoutTask_labelsInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    color?: NullableStringFieldUpdateOperationsInput | string | null
    projects?: ProjectsUpdateOneRequiredWithoutLabelsNestedInput
  }

  export type LabelsUncheckedUpdateWithoutTask_labelsInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    color?: NullableStringFieldUpdateOperationsInput | string | null
    project_id?: StringFieldUpdateOperationsInput | string
  }

  export type TasksUpsertWithoutTask_labelsInput = {
    update: XOR<TasksUpdateWithoutTask_labelsInput, TasksUncheckedUpdateWithoutTask_labelsInput>
    create: XOR<TasksCreateWithoutTask_labelsInput, TasksUncheckedCreateWithoutTask_labelsInput>
  }

  export type TasksUpdateWithoutTask_labelsInput = {
    id?: StringFieldUpdateOperationsInput | string
    slug?: StringFieldUpdateOperationsInput | string
    markdown?: NullableStringFieldUpdateOperationsInput | string | null
    summary?: StringFieldUpdateOperationsInput | string
    type?: StringFieldUpdateOperationsInput | string
    impact?: NullableIntFieldUpdateOperationsInput | number | null
    status?: IntFieldUpdateOperationsInput | number
    created_at?: DateTimeFieldUpdateOperationsInput | Date | string
    created_by?: StringFieldUpdateOperationsInput | string
    assigned_by?: NullableStringFieldUpdateOperationsInput | string | null
    assigned_at?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    modified_at?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    modified_by?: NullableStringFieldUpdateOperationsInput | string | null
    sort_order?: NullableIntFieldUpdateOperationsInput | number | null
    task_users?: Task_usersUpdateManyWithoutTasksNestedInput
    projects?: ProjectsUpdateOneRequiredWithoutTasksNestedInput
  }

  export type TasksUncheckedUpdateWithoutTask_labelsInput = {
    id?: StringFieldUpdateOperationsInput | string
    slug?: StringFieldUpdateOperationsInput | string
    markdown?: NullableStringFieldUpdateOperationsInput | string | null
    summary?: StringFieldUpdateOperationsInput | string
    type?: StringFieldUpdateOperationsInput | string
    impact?: NullableIntFieldUpdateOperationsInput | number | null
    status?: IntFieldUpdateOperationsInput | number
    project_id?: StringFieldUpdateOperationsInput | string
    created_at?: DateTimeFieldUpdateOperationsInput | Date | string
    created_by?: StringFieldUpdateOperationsInput | string
    assigned_by?: NullableStringFieldUpdateOperationsInput | string | null
    assigned_at?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    modified_at?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    modified_by?: NullableStringFieldUpdateOperationsInput | string | null
    sort_order?: NullableIntFieldUpdateOperationsInput | number | null
    task_users?: Task_usersUncheckedUpdateManyWithoutTasksNestedInput
  }

  export type TasksCreateWithoutTask_usersInput = {
    id: string
    slug: string
    markdown?: string | null
    summary: string
    type: string
    impact?: number | null
    status: number
    created_at: Date | string
    created_by: string
    assigned_by?: string | null
    assigned_at?: Date | string | null
    modified_at?: Date | string | null
    modified_by?: string | null
    sort_order?: number | null
    task_labels?: Task_labelsCreateNestedManyWithoutTasksInput
    projects: ProjectsCreateNestedOneWithoutTasksInput
  }

  export type TasksUncheckedCreateWithoutTask_usersInput = {
    id: string
    slug: string
    markdown?: string | null
    summary: string
    type: string
    impact?: number | null
    status: number
    project_id: string
    created_at: Date | string
    created_by: string
    assigned_by?: string | null
    assigned_at?: Date | string | null
    modified_at?: Date | string | null
    modified_by?: string | null
    sort_order?: number | null
    task_labels?: Task_labelsUncheckedCreateNestedManyWithoutTasksInput
  }

  export type TasksCreateOrConnectWithoutTask_usersInput = {
    where: TasksWhereUniqueInput
    create: XOR<TasksCreateWithoutTask_usersInput, TasksUncheckedCreateWithoutTask_usersInput>
  }

  export type TasksUpsertWithoutTask_usersInput = {
    update: XOR<TasksUpdateWithoutTask_usersInput, TasksUncheckedUpdateWithoutTask_usersInput>
    create: XOR<TasksCreateWithoutTask_usersInput, TasksUncheckedCreateWithoutTask_usersInput>
  }

  export type TasksUpdateWithoutTask_usersInput = {
    id?: StringFieldUpdateOperationsInput | string
    slug?: StringFieldUpdateOperationsInput | string
    markdown?: NullableStringFieldUpdateOperationsInput | string | null
    summary?: StringFieldUpdateOperationsInput | string
    type?: StringFieldUpdateOperationsInput | string
    impact?: NullableIntFieldUpdateOperationsInput | number | null
    status?: IntFieldUpdateOperationsInput | number
    created_at?: DateTimeFieldUpdateOperationsInput | Date | string
    created_by?: StringFieldUpdateOperationsInput | string
    assigned_by?: NullableStringFieldUpdateOperationsInput | string | null
    assigned_at?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    modified_at?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    modified_by?: NullableStringFieldUpdateOperationsInput | string | null
    sort_order?: NullableIntFieldUpdateOperationsInput | number | null
    task_labels?: Task_labelsUpdateManyWithoutTasksNestedInput
    projects?: ProjectsUpdateOneRequiredWithoutTasksNestedInput
  }

  export type TasksUncheckedUpdateWithoutTask_usersInput = {
    id?: StringFieldUpdateOperationsInput | string
    slug?: StringFieldUpdateOperationsInput | string
    markdown?: NullableStringFieldUpdateOperationsInput | string | null
    summary?: StringFieldUpdateOperationsInput | string
    type?: StringFieldUpdateOperationsInput | string
    impact?: NullableIntFieldUpdateOperationsInput | number | null
    status?: IntFieldUpdateOperationsInput | number
    project_id?: StringFieldUpdateOperationsInput | string
    created_at?: DateTimeFieldUpdateOperationsInput | Date | string
    created_by?: StringFieldUpdateOperationsInput | string
    assigned_by?: NullableStringFieldUpdateOperationsInput | string | null
    assigned_at?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    modified_at?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    modified_by?: NullableStringFieldUpdateOperationsInput | string | null
    sort_order?: NullableIntFieldUpdateOperationsInput | number | null
    task_labels?: Task_labelsUncheckedUpdateManyWithoutTasksNestedInput
  }

  export type Task_labelsCreateWithoutTasksInput = {
    labels: LabelsCreateNestedOneWithoutTask_labelsInput
  }

  export type Task_labelsUncheckedCreateWithoutTasksInput = {
    label_id: string
  }

  export type Task_labelsCreateOrConnectWithoutTasksInput = {
    where: Task_labelsWhereUniqueInput
    create: XOR<Task_labelsCreateWithoutTasksInput, Task_labelsUncheckedCreateWithoutTasksInput>
  }

  export type Task_labelsCreateManyTasksInputEnvelope = {
    data: Enumerable<Task_labelsCreateManyTasksInput>
    skipDuplicates?: boolean
  }

  export type Task_usersCreateWithoutTasksInput = {
    user_id: string
    role: string
  }

  export type Task_usersUncheckedCreateWithoutTasksInput = {
    user_id: string
    role: string
  }

  export type Task_usersCreateOrConnectWithoutTasksInput = {
    where: Task_usersWhereUniqueInput
    create: XOR<Task_usersCreateWithoutTasksInput, Task_usersUncheckedCreateWithoutTasksInput>
  }

  export type Task_usersCreateManyTasksInputEnvelope = {
    data: Enumerable<Task_usersCreateManyTasksInput>
    skipDuplicates?: boolean
  }

  export type ProjectsCreateWithoutTasksInput = {
    id: string
    slug: string
    name: string
    color: string
    workspace_id: string
    created_at: Date | string
    created_by: string
    modified_at?: Date | string | null
    modified_by?: string | null
    labels?: LabelsCreateNestedManyWithoutProjectsInput
  }

  export type ProjectsUncheckedCreateWithoutTasksInput = {
    id: string
    slug: string
    name: string
    color: string
    workspace_id: string
    created_at: Date | string
    created_by: string
    modified_at?: Date | string | null
    modified_by?: string | null
    labels?: LabelsUncheckedCreateNestedManyWithoutProjectsInput
  }

  export type ProjectsCreateOrConnectWithoutTasksInput = {
    where: ProjectsWhereUniqueInput
    create: XOR<ProjectsCreateWithoutTasksInput, ProjectsUncheckedCreateWithoutTasksInput>
  }

  export type Task_labelsUpsertWithWhereUniqueWithoutTasksInput = {
    where: Task_labelsWhereUniqueInput
    update: XOR<Task_labelsUpdateWithoutTasksInput, Task_labelsUncheckedUpdateWithoutTasksInput>
    create: XOR<Task_labelsCreateWithoutTasksInput, Task_labelsUncheckedCreateWithoutTasksInput>
  }

  export type Task_labelsUpdateWithWhereUniqueWithoutTasksInput = {
    where: Task_labelsWhereUniqueInput
    data: XOR<Task_labelsUpdateWithoutTasksInput, Task_labelsUncheckedUpdateWithoutTasksInput>
  }

  export type Task_labelsUpdateManyWithWhereWithoutTasksInput = {
    where: Task_labelsScalarWhereInput
    data: XOR<Task_labelsUpdateManyMutationInput, Task_labelsUncheckedUpdateManyWithoutTask_labelsInput>
  }

  export type Task_usersUpsertWithWhereUniqueWithoutTasksInput = {
    where: Task_usersWhereUniqueInput
    update: XOR<Task_usersUpdateWithoutTasksInput, Task_usersUncheckedUpdateWithoutTasksInput>
    create: XOR<Task_usersCreateWithoutTasksInput, Task_usersUncheckedCreateWithoutTasksInput>
  }

  export type Task_usersUpdateWithWhereUniqueWithoutTasksInput = {
    where: Task_usersWhereUniqueInput
    data: XOR<Task_usersUpdateWithoutTasksInput, Task_usersUncheckedUpdateWithoutTasksInput>
  }

  export type Task_usersUpdateManyWithWhereWithoutTasksInput = {
    where: Task_usersScalarWhereInput
    data: XOR<Task_usersUpdateManyMutationInput, Task_usersUncheckedUpdateManyWithoutTask_usersInput>
  }

  export type Task_usersScalarWhereInput = {
    AND?: Enumerable<Task_usersScalarWhereInput>
    OR?: Enumerable<Task_usersScalarWhereInput>
    NOT?: Enumerable<Task_usersScalarWhereInput>
    task_id?: UuidFilter | string
    user_id?: UuidFilter | string
    role?: StringFilter | string
  }

  export type ProjectsUpsertWithoutTasksInput = {
    update: XOR<ProjectsUpdateWithoutTasksInput, ProjectsUncheckedUpdateWithoutTasksInput>
    create: XOR<ProjectsCreateWithoutTasksInput, ProjectsUncheckedCreateWithoutTasksInput>
  }

  export type ProjectsUpdateWithoutTasksInput = {
    id?: StringFieldUpdateOperationsInput | string
    slug?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    color?: StringFieldUpdateOperationsInput | string
    workspace_id?: StringFieldUpdateOperationsInput | string
    created_at?: DateTimeFieldUpdateOperationsInput | Date | string
    created_by?: StringFieldUpdateOperationsInput | string
    modified_at?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    modified_by?: NullableStringFieldUpdateOperationsInput | string | null
    labels?: LabelsUpdateManyWithoutProjectsNestedInput
  }

  export type ProjectsUncheckedUpdateWithoutTasksInput = {
    id?: StringFieldUpdateOperationsInput | string
    slug?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    color?: StringFieldUpdateOperationsInput | string
    workspace_id?: StringFieldUpdateOperationsInput | string
    created_at?: DateTimeFieldUpdateOperationsInput | Date | string
    created_by?: StringFieldUpdateOperationsInput | string
    modified_at?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    modified_by?: NullableStringFieldUpdateOperationsInput | string | null
    labels?: LabelsUncheckedUpdateManyWithoutProjectsNestedInput
  }

  export type Task_labelsCreateManyLabelsInput = {
    task_id: string
  }

  export type Task_labelsUpdateWithoutLabelsInput = {
    tasks?: TasksUpdateOneRequiredWithoutTask_labelsNestedInput
  }

  export type Task_labelsUncheckedUpdateWithoutLabelsInput = {
    task_id?: StringFieldUpdateOperationsInput | string
  }

  export type Task_labelsUncheckedUpdateManyWithoutTask_labelsInput = {
    task_id?: StringFieldUpdateOperationsInput | string
  }

  export type LabelsCreateManyProjectsInput = {
    id: string
    name: string
    color?: string | null
  }

  export type TasksCreateManyProjectsInput = {
    id: string
    slug: string
    markdown?: string | null
    summary: string
    type: string
    impact?: number | null
    status: number
    created_at: Date | string
    created_by: string
    assigned_by?: string | null
    assigned_at?: Date | string | null
    modified_at?: Date | string | null
    modified_by?: string | null
    sort_order?: number | null
  }

  export type LabelsUpdateWithoutProjectsInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    color?: NullableStringFieldUpdateOperationsInput | string | null
    task_labels?: Task_labelsUpdateManyWithoutLabelsNestedInput
  }

  export type LabelsUncheckedUpdateWithoutProjectsInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    color?: NullableStringFieldUpdateOperationsInput | string | null
    task_labels?: Task_labelsUncheckedUpdateManyWithoutLabelsNestedInput
  }

  export type LabelsUncheckedUpdateManyWithoutLabelsInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    color?: NullableStringFieldUpdateOperationsInput | string | null
  }

  export type TasksUpdateWithoutProjectsInput = {
    id?: StringFieldUpdateOperationsInput | string
    slug?: StringFieldUpdateOperationsInput | string
    markdown?: NullableStringFieldUpdateOperationsInput | string | null
    summary?: StringFieldUpdateOperationsInput | string
    type?: StringFieldUpdateOperationsInput | string
    impact?: NullableIntFieldUpdateOperationsInput | number | null
    status?: IntFieldUpdateOperationsInput | number
    created_at?: DateTimeFieldUpdateOperationsInput | Date | string
    created_by?: StringFieldUpdateOperationsInput | string
    assigned_by?: NullableStringFieldUpdateOperationsInput | string | null
    assigned_at?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    modified_at?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    modified_by?: NullableStringFieldUpdateOperationsInput | string | null
    sort_order?: NullableIntFieldUpdateOperationsInput | number | null
    task_labels?: Task_labelsUpdateManyWithoutTasksNestedInput
    task_users?: Task_usersUpdateManyWithoutTasksNestedInput
  }

  export type TasksUncheckedUpdateWithoutProjectsInput = {
    id?: StringFieldUpdateOperationsInput | string
    slug?: StringFieldUpdateOperationsInput | string
    markdown?: NullableStringFieldUpdateOperationsInput | string | null
    summary?: StringFieldUpdateOperationsInput | string
    type?: StringFieldUpdateOperationsInput | string
    impact?: NullableIntFieldUpdateOperationsInput | number | null
    status?: IntFieldUpdateOperationsInput | number
    created_at?: DateTimeFieldUpdateOperationsInput | Date | string
    created_by?: StringFieldUpdateOperationsInput | string
    assigned_by?: NullableStringFieldUpdateOperationsInput | string | null
    assigned_at?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    modified_at?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    modified_by?: NullableStringFieldUpdateOperationsInput | string | null
    sort_order?: NullableIntFieldUpdateOperationsInput | number | null
    task_labels?: Task_labelsUncheckedUpdateManyWithoutTasksNestedInput
    task_users?: Task_usersUncheckedUpdateManyWithoutTasksNestedInput
  }

  export type TasksUncheckedUpdateManyWithoutTasksInput = {
    id?: StringFieldUpdateOperationsInput | string
    slug?: StringFieldUpdateOperationsInput | string
    markdown?: NullableStringFieldUpdateOperationsInput | string | null
    summary?: StringFieldUpdateOperationsInput | string
    type?: StringFieldUpdateOperationsInput | string
    impact?: NullableIntFieldUpdateOperationsInput | number | null
    status?: IntFieldUpdateOperationsInput | number
    created_at?: DateTimeFieldUpdateOperationsInput | Date | string
    created_by?: StringFieldUpdateOperationsInput | string
    assigned_by?: NullableStringFieldUpdateOperationsInput | string | null
    assigned_at?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    modified_at?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    modified_by?: NullableStringFieldUpdateOperationsInput | string | null
    sort_order?: NullableIntFieldUpdateOperationsInput | number | null
  }

  export type Task_labelsCreateManyTasksInput = {
    label_id: string
  }

  export type Task_usersCreateManyTasksInput = {
    user_id: string
    role: string
  }

  export type Task_labelsUpdateWithoutTasksInput = {
    labels?: LabelsUpdateOneRequiredWithoutTask_labelsNestedInput
  }

  export type Task_labelsUncheckedUpdateWithoutTasksInput = {
    label_id?: StringFieldUpdateOperationsInput | string
  }

  export type Task_usersUpdateWithoutTasksInput = {
    user_id?: StringFieldUpdateOperationsInput | string
    role?: StringFieldUpdateOperationsInput | string
  }

  export type Task_usersUncheckedUpdateWithoutTasksInput = {
    user_id?: StringFieldUpdateOperationsInput | string
    role?: StringFieldUpdateOperationsInput | string
  }

  export type Task_usersUncheckedUpdateManyWithoutTask_usersInput = {
    user_id?: StringFieldUpdateOperationsInput | string
    role?: StringFieldUpdateOperationsInput | string
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
