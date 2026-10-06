import { useState } from "react";
import { ChevronDown, ChevronUp, Map } from "lucide-react";
import type { FamilleDuCatalogue } from "../../feature-domain/modele/types";
import { presentationDeLaFamille } from "../familles";

/**
 * La légende du canevas (conception du lot L1, partie 6.4) : posée sur le
 * canevas, en bas à gauche à côté du zoom, étroite, repliable mais ouverte
 * par défaut ; elle ne prend jamais la place du panneau des propriétés.
 * Chaque marque a une forme ou un mot en plus de sa couleur (spécification
 * 10.6). Les familles présentes sur le canevas s'y lisent avec leur pictogramme.
 */
/** Le choix de la personne (repliée ou ouverte) se garde dans ce navigateur : c'est un réglage d'affichage, pas du modèle. */
const CLE_DE_LA_LEGENDE = "oscar.studio.affichage.v1:legende";

function lireLeChoix(): boolean {
  try {
    return window.localStorage.getItem(CLE_DE_LA_LEGENDE) !== "repliee";
  } catch {
    return true;
  }
}

export default function Legende({ familles }: { readonly familles: readonly FamilleDuCatalogue[] }) {
  const [ouverte, setOuverte] = useState(lireLeChoix);
  const basculer = () => setOuverte((valeur) => {
    try {
      window.localStorage.setItem(CLE_DE_LA_LEGENDE, valeur ? "repliee" : "ouverte");
    } catch {
      // Stockage refusé : le choix vaut pour cette page seulement.
    }
    return !valeur;
  });
  return (
    <aside className={`ec-legende${ouverte ? "" : " ec-legende--repliee"}`} aria-label="Légende du canevas">
      <button
        className="ec-legende__bascule"
        type="button"
        aria-expanded={ouverte}
        aria-controls="ec-legende-contenu"
        onClick={basculer}
      >
        <Map size={13} aria-hidden="true" /> Légende {ouverte ? <ChevronDown size={13} aria-hidden="true" /> : <ChevronUp size={13} aria-hidden="true" />}
      </button>
      {ouverte && (
        <ul id="ec-legende-contenu" className="ec-legende__liste">
          <li><span className="ec-legende__entree" aria-hidden="true" /> Entrée : point creux, à gauche</li>
          <li><span className="ec-legende__sortie" aria-hidden="true" /> Sortie : point plein, à droite</li>
          <li>
            <svg className="ec-legende__fleche" width="26" height="10" viewBox="0 0 26 10" aria-hidden="true">
              <line x1="0" y1="5" x2="19" y2="5" />
              <path d="M19 1 L25 5 L19 9 Z" />
            </svg>
            Liaison : la flèche montre où va la donnée
          </li>
          <li><span className="ec-legende__zone" aria-hidden="true" /> Zone d’environnement</li>
          <li><span className="ec-legende__zone ec-legende__zone--externe" aria-hidden="true" /> Zone Externe : hors de nos machines</li>
          <li><span className="ec-marque ec-marque--facultative">Facultative</span> Le bundle s’en passe</li>
          {familles.map((famille) => {
            const Pictogramme = presentationDeLaFamille(famille.code).pictogramme;
            return (
              <li key={famille.code} className={`ec-legende__famille ec-legende__famille--${presentationDeLaFamille(famille.code).teinte}`}>
                <Pictogramme size={13} aria-hidden="true" /> {famille.nom}
              </li>
            );
          })}
        </ul>
      )}
    </aside>
  );
}
