// Deprecated: Firebase has been migrated to local MySQL + PHP architecture.
// This stub is kept solely to prevent any compilation issues.
export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  console.error('Legacy Firestore Error Handler called:', error, operationType, path);
  throw error;
}
