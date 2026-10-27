/** Un extrait de la base documentaire : une section `##` d'un document markdown. */
export type Chunk = {
  /** Identifiant stable et lisible, utilisé dans les citations : `02-security-whitepaper#Encryption`. */
  id: string;
  /** Nom du fichier sans extension. */
  doc: string;
  docTitle: string;
  docVersion: string;
  section: string;
  /** Contenu brut de la section, sans le titre. */
  body: string;
  /**
   * Texte indexé : titre du document + titre de section + contenu.
   * Le titre donne du contexte à des sections courtes (« Backups » seul ne dit pas de quel produit on parle).
   */
  text: string;
};

export type ScoredChunk = { chunk: Chunk; score: number };

export type Index = {
  builtAt: string;
  chunks: Chunk[];
};
