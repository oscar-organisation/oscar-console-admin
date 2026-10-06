import {
  AppWindow,
  Bot,
  Globe,
  HardDrive,
  MapPinned,
  MessagesSquare,
  Package,
  RadioTower,
  ServerCog,
  type LucideIcon,
} from "lucide-react";

/**
 * Les familles de la palette (formalisation, partie 2.8) : chacune son
 * pictogramme et sa teinte, repris sur le canevas et dans la légende.
 *
 * Le nom et l'ordre des familles viennent du catalogue du serveur ; ce
 * fichier ne dit que ce qui est propre à l'écran. La teinte est un jeton
 * de couleur (`--famille-...`), défini pour le thème sombre et le thème clair
 * dans la feuille du canevas : une teinte sourde qui classe sans attirer,
 * l'orange de la charte restant la seule couleur d'action (question Q7).
 * Jamais la couleur seule : chaque famille a aussi son pictogramme et son nom.
 *
 * Les pictogrammes sont ceux de lucide-react 0.468.0, la version installée
 * (noms vérifiés dans le paquet).
 */

export interface PresentationDUneFamille {
  readonly pictogramme: LucideIcon;
  /** Le nom du jeton de couleur, sans les deux tirets. */
  readonly teinte: string;
}

export const FAMILLES: Readonly<Record<string, PresentationDUneFamille>> = {
  FAMILLE_PALETTE_ENVIRONNEMENTS: { pictogramme: MapPinned, teinte: "famille-environnements" },
  FAMILLE_PALETTE_TEMPS_REEL: { pictogramme: RadioTower, teinte: "famille-temps-reel" },
  FAMILLE_PALETTE_APPAREILS: { pictogramme: Bot, teinte: "famille-appareils" },
  FAMILLE_PALETTE_MESSAGERIE_EVENEMENTS: { pictogramme: MessagesSquare, teinte: "famille-messagerie" },
  FAMILLE_PALETTE_RESEAU_INTERNET: { pictogramme: Globe, teinte: "famille-reseau" },
  FAMILLE_PALETTE_STOCKAGE: { pictogramme: HardDrive, teinte: "famille-stockage" },
  FAMILLE_PALETTE_PROGRAMMES_EXISTANTS: { pictogramme: Package, teinte: "famille-programmes" },
  FAMILLE_PALETTE_SERVICES_APPLICATIONS: { pictogramme: ServerCog, teinte: "famille-services" },
};

/** Le pictogramme d'une application : la famille est celle des services, le dessin la distingue. */
export const PICTOGRAMME_D_UNE_APPLICATION: LucideIcon = AppWindow;

/** La présentation d'une famille ; une famille inconnue de l'écran prend celle des services. */
export function presentationDeLaFamille(code: string): PresentationDUneFamille {
  return FAMILLES[code] ?? { pictogramme: ServerCog, teinte: "famille-services" };
}
