import { useState, type CSSProperties } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import type { FamilleDuCatalogue } from "../../feature-domain/modele/types";
import { presentationDeLaFamille } from "../familles";

/**
 * La légende du canevas (conception du lot L1, partie 6.4) : toujours
 * visible, repliable mais ouverte par défaut. Chaque marque a une forme ou un
 * mot en plus de sa couleur (spécification 10.6), et les familles présentes
 * sur le canevas s'y lisent avec leur pictogramme.
 */
export default function Legende({ familles }: { readonly familles: readonly FamilleDuCatalogue[] }) {
  const [ouverte, setOuverte] = useState(true);
  return (
    <aside className="ec-legende" aria-label="Légende du canevas">
      <button
        className="ec-legende__bascule"
        type="button"
        aria-expanded={ouverte}
        aria-controls="ec-legende-contenu"
        onClick={() => setOuverte((valeur) => !valeur)}
      >
        Légende {ouverte ? <ChevronUp size={16} aria-hidden="true" /> : <ChevronDown size={16} aria-hidden="true" />}
      </button>
      {ouverte && (
        <ul id="ec-legende-contenu" className="ec-legende__liste">
          <li><span className="ec-legende__entree" aria-hidden="true" /> Entrée : point creux, à gauche du bloc</li>
          <li><span className="ec-legende__sortie" aria-hidden="true" /> Sortie : point plein, à droite du bloc</li>
          <li>
            <svg className="ec-legende__fleche" width="32" height="12" viewBox="0 0 32 12" aria-hidden="true">
              <line x1="0" y1="6" x2="24" y2="6" />
              <path d="M24 1 L31 6 L24 11 Z" />
            </svg>
            Liaison de données : la flèche montre où va la donnée
          </li>
          <li><span className="ec-legende__zone" aria-hidden="true" /> Zone d'environnement</li>
          <li><span className="ec-marque ec-marque--facultative">Facultative</span> Zone dont le bundle peut se passer</li>
          <li><span className="ec-legende__zone ec-legende__zone--externe" aria-hidden="true" /> Zone Externe : hors de nos machines</li>
          {familles.map((famille) => {
            const presentation = presentationDeLaFamille(famille.code);
            const Pictogramme = presentation.pictogramme;
            return (
              <li key={famille.code} style={{ "--ec-teinte": `var(--${presentation.teinte})` } as CSSProperties}>
                <span className="ec-legende__famille"><Pictogramme size={15} aria-hidden="true" /></span>
                {famille.nom}
              </li>
            );
          })}
        </ul>
      )}
    </aside>
  );
}
