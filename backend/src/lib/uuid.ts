
export function isUUID(uuid: string) {
    const s = "" + uuid;

    const result = s.match('^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$');

    if (result === null) {
      return false;
    }
    return true;
}

// When we compare UUID column with non-UUID string, drizzle orm will raise error: "invalid input syntax for type uuid..."
export function mustBeUUID(uuid: string) {
    if (isUUID(uuid)) {
      return uuid;
    }

    return '00000000-0000-0000-0000-000000000000';
}
