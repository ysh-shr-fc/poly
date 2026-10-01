export type FieldKind = "text" | "richtext";
export type TranslatableSchema = Record<string, Record<string, FieldKind>>;

type ComponentDefinition = { name: string; schema?: Record<string, { type?: string; translatable?: boolean }> };

const KINDS: Record<string, FieldKind> = { text: "text", textarea: "text", richtext: "richtext" };

// Turns the Management API's component list into component → { field → kind } for fields marked Translatable.
// Other field types (numbers, assets, options, markdown, blocks) are left out on purpose.
export function translatableFields(components: ComponentDefinition[]): TranslatableSchema {
  const schema: TranslatableSchema = {};
  for (const component of components) {
    const fields: Record<string, FieldKind> = {};
    for (const [name, definition] of Object.entries(component.schema ?? {})) {
      const kind = definition.type ? KINDS[definition.type] : undefined;
      if (definition.translatable && kind) fields[name] = kind;
    }
    if (Object.keys(fields).length) schema[component.name] = fields;
  }
  return schema;
}
