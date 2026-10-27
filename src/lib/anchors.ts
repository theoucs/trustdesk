/** Ancre HTML d'une section : sert aux liens de citation `/knowledge/<doc>#<ancre>`. Utilisable côté client. */
export function sectionAnchor(section: string) {
  return section
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export function citationHref(chunkId: string) {
  const [doc, section] = chunkId.split("#");
  return `/knowledge/${doc}#${sectionAnchor(section)}`;
}

/** `04-identity-access#Audit logs` → `Identity Access › Audit logs` quand le titre du document n'est pas connu. */
export function chunkLabel(chunkId: string) {
  const [doc, section] = chunkId.split("#");
  const title = doc.replace(/^\d+-/, "").replace(/-/g, " ");
  return `${title.charAt(0).toUpperCase()}${title.slice(1)} › ${section}`;
}
