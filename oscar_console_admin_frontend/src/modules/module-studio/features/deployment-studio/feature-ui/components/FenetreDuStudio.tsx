import { useEffect, useId, useRef, type KeyboardEvent, type ReactNode } from "react";
import { X } from "lucide-react";

/**
 * Une fenêtre de l'éditeur (menu « Ajouter », aperçu d'un changement de
 * parent, confirmation d'une suppression, reprise, conflit) : une boîte de
 * dialogue au sens de WAI-ARIA, qu'on peut mener au clavier seul.
 *
 * - à l'ouverture, le focus va dans la fenêtre (sur `focusInitial`, sinon sur
 *   le premier élément qu'on peut atteindre) ;
 * - Tab et Maj+Tab tournent dans la fenêtre sans en sortir ;
 * - Échap la ferme (si `onFermer` est donné) ;
 * - à la fermeture, le focus revient là où il était avant l'ouverture.
 */

const ATTEIGNABLES = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), '
  + 'textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export interface ProprietesDeLaFenetre {
  readonly titre: string;
  /** L'icône de la fenêtre, dans sa pastille colorée, comme dans l'ancien Studio. */
  readonly icone?: ReactNode;
  /** La teinte de la pastille : l'action, ou le danger (une suppression). */
  readonly ton?: "action" | "danger";
  /** Un mot au-dessus du titre : « Ajouter », « Suppression »... */
  readonly surtitre?: string;
  readonly onFermer?: () => void;
  /** Le sélecteur de l'élément qui reçoit le focus à l'ouverture. */
  readonly focusInitial?: string | undefined;
  readonly children: ReactNode;
  readonly actions?: ReactNode;
  readonly classe?: string;
}

export default function FenetreDuStudio({ titre, icone, ton, surtitre, onFermer, focusInitial, children, actions, classe }: ProprietesDeLaFenetre) {
  const idDuTitre = useId();
  const fenetre = useRef<HTMLElement>(null);

  useEffect(() => {
    const avant = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const racine = fenetre.current;
    const premier = (focusInitial ? racine?.querySelector<HTMLElement>(focusInitial) : null)
      ?? racine?.querySelector<HTMLElement>(ATTEIGNABLES);
    (premier ?? racine)?.focus();
    // Le focus revient où il était, si cet élément est encore dans la page.
    return () => { if (avant?.isConnected) avant.focus(); };
    // `focusInitial` est un texte fixe : l'effet ne joue qu'à l'ouverture.
  }, [focusInitial]);

  const auClavier = (evenement: KeyboardEvent<HTMLElement>) => {
    if (evenement.key === "Escape" && onFermer) {
      evenement.preventDefault();
      evenement.stopPropagation();
      onFermer();
      return;
    }
    if (evenement.key !== "Tab" || !fenetre.current) return;
    const atteignables = [...fenetre.current.querySelectorAll<HTMLElement>(ATTEIGNABLES)];
    const premier = atteignables[0];
    const dernier = atteignables[atteignables.length - 1];
    if (!premier || !dernier) return;
    if (evenement.shiftKey && document.activeElement === premier) {
      evenement.preventDefault();
      dernier.focus();
    } else if (!evenement.shiftKey && document.activeElement === dernier) {
      evenement.preventDefault();
      premier.focus();
    }
  };

  return (
    <div className="modal-backdrop">
      <section
        ref={fenetre}
        className={`project-dialog ec-fenetre${classe ? ` ${classe}` : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={idDuTitre}
        tabIndex={-1}
        onKeyDown={auClavier}
      >
        <header className="dialog-header">
          {icone && <div className={`dialog-icon${ton === "danger" ? " dialog-icon--danger" : " dialog-icon--blue"}`}>{icone}</div>}
          <div>
            {surtitre && <span>{surtitre}</span>}
            <h2 id={idDuTitre}>{titre}</h2>
          </div>
          {onFermer && (
            <button className="icon-button" type="button" onClick={onFermer} aria-label="Fermer">
              <X size={18} aria-hidden="true" />
            </button>
          )}
        </header>
        <div className="project-dialog__body ec-fenetre__corps">{children}</div>
        {actions && <footer className="dialog-footer">{actions}</footer>}
      </section>
    </div>
  );
}
