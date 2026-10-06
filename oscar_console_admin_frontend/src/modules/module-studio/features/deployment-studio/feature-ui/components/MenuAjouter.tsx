import { useRef, type KeyboardEvent } from "react";
import { Plus } from "lucide-react";
import FenetreDuStudio from "./FenetreDuStudio";

/**
 * Le menu « Ajouter » (conception du lot L1, parties 4.2 et 6.5 ;
 * spécification 12.5). Il sert de deux façons :
 * - « Ajouter dans « Robot M3 Pro » » : ce que cet élément peut recevoir, à
 *   cet instant (bouton de l'inspecteur, touche A) ;
 * - « Où ajouter « Service » ? » : les endroits qui l'accepteraient (un clic
 *   sur une carte de la palette qui ne va pas dans l'élément choisi).
 * Il ne propose jamais que des choix que les règles acceptent ; s'il n'y en
 * a aucun, il dit pourquoi.
 *
 * Au clavier : flèches haut et bas (ou Début, Fin) pour choisir, Entrée pour
 * ajouter, Échap pour fermer.
 */

export interface ChoixDuMenu {
  readonly cle: string;
  readonly nom: string;
  readonly description?: string;
  readonly code?: string;
}

export interface ProprietesDuMenuAjouter {
  readonly surtitre: string;
  readonly titre: string;
  /** Une phrase au-dessus des choix : pourquoi on propose ces endroits, ou pourquoi rien ne va ici. */
  readonly explication?: string | null;
  readonly choix: readonly ChoixDuMenu[];
  /** Le choix qui reçoit le focus à l'ouverture. */
  readonly cleVisee?: string | null;
  /** Ce qui s'affiche quand il n'y a aucun choix. */
  readonly siVide: string;
  readonly onChoisir: (cle: string) => void;
  readonly onFermer: () => void;
}

export default function MenuAjouter({ surtitre, titre, explication, choix, cleVisee, siVide, onChoisir, onFermer }: ProprietesDuMenuAjouter) {
  const liste = useRef<HTMLUListElement>(null);
  const vise = cleVisee && choix.some((un) => un.cle === cleVisee) ? cleVisee : null;

  // Les flèches passent d'un choix à l'autre, en boucle ; Tab sort du menu vers les boutons de la fenêtre.
  const auClavier = (evenement: KeyboardEvent<HTMLUListElement>) => {
    const elements = [...(liste.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [])];
    if (elements.length === 0) return;
    const rang = elements.indexOf(document.activeElement as HTMLButtonElement);
    let suivant: number | null = null;
    if (evenement.key === "ArrowDown") suivant = (rang + 1) % elements.length;
    else if (evenement.key === "ArrowUp") suivant = (rang - 1 + elements.length) % elements.length;
    else if (evenement.key === "Home") suivant = 0;
    else if (evenement.key === "End") suivant = elements.length - 1;
    if (suivant === null) return;
    evenement.preventDefault();
    elements[suivant]?.focus();
  };

  return (
    <FenetreDuStudio
      surtitre={surtitre}
      titre={titre}
      icone={<Plus size={20} aria-hidden="true" />}
      onFermer={onFermer}
      // Les clés sont des identifiants et des codes, sans guillemet : elles vont telles quelles dans le sélecteur.
      focusInitial={vise ? `[data-cle="${vise}"]` : '[role="menuitem"]'}
      classe="ec-fenetre--menu"
    >
      {explication && <p className="ec-explication-du-menu" role={choix.length === 0 ? "alert" : undefined}>{explication}</p>}
      {choix.length === 0 ? (
        <p className="ec-texte-discret">{siVide}</p>
      ) : (
        <ul ref={liste} className="ec-menu" role="menu" aria-label={titre} onKeyDown={auClavier}>
          {choix.map((un) => (
            <li key={un.cle} role="none">
              <button
                type="button"
                role="menuitem"
                aria-label={un.nom}
                className={`ec-menu__choix${vise === un.cle ? " ec-menu__choix--vise" : ""}`}
                data-cle={un.cle}
                onClick={() => onChoisir(un.cle)}
              >
                <Plus size={15} aria-hidden="true" />
                <span>
                  <strong>{un.nom}</strong>
                  {un.description && <small>{un.description}</small>}
                  {un.code && <code>{un.code}</code>}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </FenetreDuStudio>
  );
}
