import { useState } from "react";
import { ChevronDown, ChevronUp, Map } from "lucide-react";
import type { FamilleDuCatalogue } from "../../feature-domain/modele/types";
import { legendeOuverte, retenirLaLegende } from "../affichage";
import { presentationDeLaFamille } from "../familles";

/**
 * La légende du canevas (conception du lot L1, partie 6.4) : posée sur le
 * canevas, en bas à gauche à côté du zoom, étroite. Elle est repliée par
 * défaut (étape I7) : ouverte, elle couvrait le bas du canevas. Repliée, ce
 * n'est qu'un bouton discret, que le cadrage du canevas évite (canevas/cadrage.ts) ;
 * elle ne passe par-dessus les blocs que quand la personne l'ouvre.
 * Chaque marque a une forme ou un mot en plus de sa couleur (spécification
 * 10.6). Les familles présentes sur le canevas s'y lisent avec leur pictogramme.
 */
export default function Legende({ familles }: { readonly familles: readonly FamilleDuCatalogue[] }) {
  // Le choix de la personne (repliée ou ouverte) se garde dans son navigateur.
  const [ouverte, setOuverte] = useState(legendeOuverte);
  const basculer = () => setOuverte((valeur) => {
    retenirLaLegende(!valeur);
    return !valeur;
  });
  return (
    <aside className={`ec-legende${ouverte ? "" : " ec-legende--repliee"}`} aria-label="Légende du canevas">
      <button
        className="ec-legende__bascule"
        type="button"
        aria-expanded={ouverte}
        aria-controls="ec-legende-contenu"
        title={ouverte ? "Replier la légende" : "Ouvrir la légende : ce que veulent dire les points, les flèches et les cadres"}
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
