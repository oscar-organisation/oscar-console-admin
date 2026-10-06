import type { Element } from "../../../feature-domain/modele/types";
import { ChampTexte } from "./champs";
import { lienDuChamp, type Reglage } from "./reglage";

/**
 * Le nom, le code et la description d'un élément : les trois champs que
 * presque toutes les sortes partagent. Le nom est libre ; le code se règle
 * jusqu'à sa première publication, puis il est figé (spécification 12.6).
 */

export const RAISON_DU_CODE_FIGE = "Déjà publié : il ne change plus. Renommez plutôt le nom affiché.";

export interface ProprietesDesChampsCommuns {
  readonly element: Element;
  readonly reglage: Reglage;
  /** Sans description pour les sortes qui n'en prennent pas à l'écran (zone, salle). */
  readonly sansDescription?: boolean;
  /** Sans code modifiable (la salle : son code ne change jamais). */
  readonly raisonDuCodeFixe?: string;
  /** Le mot qui nomme le nom : « Nom de l'unité », « Nom du canal »... */
  readonly etiquetteDuNom?: string;
}

export default function ChampsCommuns({ element, reglage, sansDescription, raisonDuCodeFixe, etiquetteDuNom = "Nom affiché" }: ProprietesDesChampsCommuns) {
  const raisonDuCode = element.code_fige ? RAISON_DU_CODE_FIGE : raisonDuCodeFixe;
  return (
    <>
      <ChampTexte
        etiquette={etiquetteDuNom}
        forme="nom"
        valeur={element.nom ?? ""}
        aide="Libre ; le changer ne casse aucune liaison."
        {...lienDuChamp(reglage, (nom) => ({ nom }))}
      />
      <ChampTexte
        etiquette="Identifiant technique"
        forme="code"
        valeur={element.code}
        aide="Majuscules et _ ; unique dans le bundle. Les programmes et les journaux s’en servent."
        {...lienDuChamp(reglage, (code) => ({ code }))}
        {...(raisonDuCode ? { raisonDeLaLectureSeule: raisonDuCode } : {})}
      />
      {!sansDescription && (
        <ChampTexte
          etiquette="Description"
          forme="description"
          multiligne
          valeur={element.description ?? ""}
          indication="À quoi il sert, en une phrase."
          {...lienDuChamp(reglage, (description) => ({ description }))}
        />
      )}
    </>
  );
}
