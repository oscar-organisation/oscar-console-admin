import type { ArchitectureEdge, ArchitectureNode, OscarProject } from './types';

/**
 * Lire un projet enregistré avant que l'« agent » s'appelle « unité ».
 *
 * Le 05/10/2026, le rôle hébergé par un service ou une application a changé de
 * nom : un « agent » est devenu une « unité », le mot « agent » étant réservé à
 * l'intelligence artificielle. Le Studio n'écrit plus que le nouveau format,
 * mais il peut encore recevoir l'ancien :
 * - un brouillon gardé dans ce navigateur avant la mise à jour ;
 * - une version ou un préset servi par un serveur pas encore mis à jour.
 *
 * Une composition est à l'ancien format si l'un de ses blocs porte encore sa
 * liste sous `agents` (et pas sous `units`). Elle est alors convertie en entier :
 * - la liste des unités d'un bloc : `agents` devient `units` ;
 * - le type d'une unité : `agentType` devient `unitType` ;
 * - dans le contenu (`data`) des blocs et des liaisons, chaque code en
 *   majuscules perd le mot `AGENT` pour `UNITE` (`AGENTS` pour `UNITES`) :
 *   `INSTANCE_AGENT_CAMERA_AVANT` devient `INSTANCE_UNITE_CAMERA_AVANT`.
 *
 * Ne changent jamais : les identifiants internes des unités et des canaux, donc
 * les liaisons qui les citent (`in:<unité>:<canal>`) ; les noms et descriptions
 * écrits par les personnes ; une composition déjà au nouveau format, où le mot
 * AGENT d'un code garde son sens d'intelligence artificielle. C'est la même
 * règle que la fonction `convertir_composition` du serveur.
 *
 * Le compteur de la liste des projets (`summary.agents`) devient
 * `summary.units` dans tous les cas : il ne vient que de l'ancien serveur.
 *
 * C'est le seul endroit de l'interface qui connaît l'ancien format. Un projet
 * déjà au nouveau format ressort identique : on peut donc y passer tout projet
 * lu, sans se demander d'où il vient.
 */
export function projetAuFormatActuel(projet: OscarProject): OscarProject {
  const resume: unknown = projet.summary;
  const ancienne = Array.isArray(projet.nodes) && projet.nodes.some(blocAncienFormat);
  return {
    ...projet,
    ...(ancienne ? {
      nodes: projet.nodes.map((noeud) => avecDonneesConverties(noeud, donneesDuBlocAuFormatActuel)),
      edges: Array.isArray(projet.edges)
        ? projet.edges.map((lien) => avecDonneesConverties(lien, renommerCodes))
        : projet.edges,
    } : {}),
    ...(estObjet(resume) ? { summary: resumeAuFormatActuel(resume) as NonNullable<OscarProject['summary']> } : {}),
  };
}

type Objet = Record<string, unknown>;

function estObjet(valeur: unknown): valeur is Objet {
  return typeof valeur === 'object' && valeur !== null && !Array.isArray(valeur);
}

/** Vrai si ce bloc porte encore sa liste sous `agents` (et pas sous `units`). */
function blocAncienFormat(noeud: unknown): boolean {
  return estObjet(noeud) && estObjet(noeud.data) && 'agents' in noeud.data && !('units' in noeud.data);
}

// Un code : des mots en majuscules et chiffres séparés par « _ »
// (TYPE_UNITE_STANDARD, CANAL_EMISSION_01...). Un identifiant interne
// (`unit-1a2b...`) n'en est pas un.
const FORME_D_UN_CODE = /^[A-Z0-9]+(?:_[A-Z0-9]+)*$/;

// Identifiants (les liaisons s'y réfèrent) et textes écrits par les personnes :
// ce ne sont pas des codes, on n'y touche jamais.
const CHAMPS_INTACTS = new Set(['id', 'name', 'description']);

/**
 * Remplace le mot AGENT par UNITE (AGENTS par UNITES) dans chaque code, à
 * toute profondeur. Mot par mot, jamais au milieu d'un mot : REAGENT ne bouge pas.
 */
function renommerCodes(valeur: unknown): unknown {
  if (typeof valeur === 'string') {
    if (!FORME_D_UN_CODE.test(valeur)) return valeur;
    return valeur
      .split('_')
      .map((mot) => (mot === 'AGENT' ? 'UNITE' : mot === 'AGENTS' ? 'UNITES' : mot))
      .join('_');
  }
  if (Array.isArray(valeur)) return valeur.map(renommerCodes);
  if (estObjet(valeur)) {
    return Object.fromEntries(Object.entries(valeur).map(([cle, element]) => [
      cle,
      CHAMPS_INTACTS.has(cle) ? element : renommerCodes(element),
    ]));
  }
  return valeur;
}

/**
 * Copie de l'objet où `ancienne` s'appelle `nouvelle`. Si les deux clés sont
 * là, la nouvelle est gardée et l'ancienne retirée : le Studio ne doit jamais
 * la réécrire.
 */
function renommerCle(objet: Objet, ancienne: string, nouvelle: string): Objet {
  if (!(ancienne in objet)) return objet;
  const { [ancienne]: valeur, ...reste } = objet;
  return nouvelle in reste ? reste : { ...reste, [nouvelle]: valeur };
}

function donneesDuBlocAuFormatActuel(donnees: unknown): unknown {
  if (!estObjet(donnees)) return donnees;
  const renommees = renommerCle(donnees, 'agents', 'units');
  const unites = renommees.units;
  return renommerCodes(Array.isArray(unites)
    ? { ...renommees, units: unites.map((unite) => (estObjet(unite) ? renommerCle(unite, 'agentType', 'unitType') : unite)) }
    : renommees);
}

/** Bloc ou liaison dont seul le contenu (`data`) est converti ; une forme inattendue reste telle quelle. */
function avecDonneesConverties<T extends ArchitectureNode | ArchitectureEdge>(
  element: T,
  convertir: (donnees: unknown) => unknown,
): T {
  const brut: unknown = element;
  if (!estObjet(brut) || !estObjet(brut.data)) return element;
  return { ...brut, data: convertir(brut.data) } as T;
}

function resumeAuFormatActuel(resume: Objet): Objet {
  return renommerCle(resume, 'agents', 'units');
}
