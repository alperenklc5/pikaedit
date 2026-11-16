/**
 * Minimal ambient declarations for @libsql/client.
 * These are only used when the package hasn't been installed yet (CI / first
 * checkout). Once `npm install` runs, the real types from the package shadow
 * these automatically — this file becomes a no-op.
 */
declare module "@libsql/client" {
  export type InValue = string | number | bigint | boolean | null | Uint8Array;
  export type InArgs  = InValue[] | Record<string, InValue>;

  export interface InStatement {
    sql:  string;
    args: InArgs;
  }

  export interface Row extends Record<string, InValue> {}

  export interface ResultSet {
    rows:         Row[];
    rowsAffected: number;
    lastInsertRowid?: bigint;
  }

  export type TransactionMode = "write" | "read" | "deferred";

  export interface Client {
    execute(stmt: string | InStatement): Promise<ResultSet>;
    batch(stmts: Array<string | InStatement>, mode?: TransactionMode): Promise<ResultSet[]>;
    close(): void;
  }

  export interface Config {
    url:        string;
    authToken?: string;
  }

  export function createClient(config: Config): Client;
}
