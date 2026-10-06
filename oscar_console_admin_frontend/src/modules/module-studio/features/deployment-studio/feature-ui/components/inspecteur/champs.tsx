import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Info, Lock } from "lucide-react";
import type { Refus } from "../../../feature-domain/modele/types";
import { problemeDeForme, type SorteDeChamp } from "./formes";

/**
 * Les champs de l'inspecteur, dans le dessin de l'ancien éditeur : une
 * étiquette, le champ, une aide courte dessous.
 *
 * Un champ de texte montre chaque frappe tout de suite sur le canevas (un
 * aperçu), mais ne compte que pour un seul geste, quand on le quitte ou qu'on
 * appuie sur Entrée (conception du lot L1, partie 4.4). Échap rend la valeur
 * d'avant. Un refus (une forme mal écrite, une règle du modèle) s'affiche
 * sous le champ, avec ce qu'il faut faire ; la saisie reste, pour qu'on la
 * corrige.
 */

/** Ce que rend la validation d'un champ : rien si le geste est accepté, sinon la raison. */
export type ResultatDuChamp = Refus | null;

/** Le lien d'un champ avec le modèle : montrer un aperçu, l'abandonner, valider. */
export interface LienDuChamp {
  readonly onValider: (valeur: string) => ResultatDuChamp;
  readonly onApercu?: (valeur: string) => void;
  readonly onAbandon?: () => void;
}

export interface ProprietesDUnChampTexte extends LienDuChamp {
  readonly etiquette: string;
  readonly valeur: string;
  readonly forme: SorteDeChamp;
  readonly multiligne?: boolean;
  readonly aide?: string;
  readonly indication?: string;
  /** Si le champ ne se modifie pas : la raison, dite à côté (spécification 12.6). */
  readonly raisonDeLaLectureSeule?: string;
}

export function ChampTexte(proprietes: ProprietesDUnChampTexte) {
  const { etiquette, valeur, forme, onValider, onApercu, onAbandon, multiligne, aide, indication, raisonDeLaLectureSeule } = proprietes;
  const id = useId();
  const [saisie, setSaisie] = useState(valeur);
  const [enSaisie, setEnSaisie] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  // La valeur au moment où l'on est entré dans le champ : l'aperçu change `valeur` pendant qu'on écrit.
  const auDepart = useRef(valeur);

  // Une valeur qui change ailleurs (annuler, rétablir) se montre, sauf pendant qu'on écrit.
  useEffect(() => {
    if (!enSaisie) {
      setSaisie(valeur);
      setErreur(null);
    }
  }, [valeur, enSaisie]);

  const valider = () => {
    // L'aperçu s'efface : le geste final se joue à part, et compte pour un.
    onAbandon?.();
    // Les espaces au début et à la fin ne font pas partie de la valeur.
    const propre = saisie.trim();
    if (propre === auDepart.current) {
      setSaisie(auDepart.current);
      setErreur(null);
      return;
    }
    const probleme = problemeDeForme(forme, propre);
    if (probleme) {
      setErreur(probleme);
      return;
    }
    const refus = onValider(propre);
    setErreur(refus ? refus.message : null);
    if (!refus) auDepart.current = propre;
  };

  const auClavier = (evenement: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (evenement.key === "Enter" && (!multiligne || evenement.ctrlKey || evenement.metaKey)) {
      evenement.preventDefault();
      valider();
    } else if (evenement.key === "Escape") {
      // Échap rend la valeur d'avant ; il ne remonte pas jusqu'à l'éditeur (qui libérerait la sélection).
      evenement.stopPropagation();
      onAbandon?.();
      setSaisie(auDepart.current);
      setErreur(null);
    }
  };

  if (raisonDeLaLectureSeule) {
    return (
      <div className="form-field">
        <span id={`${id}-etiquette`}>{etiquette}</span>
        <p className={`ec-lecture${forme === "code" ? " ec-lecture--code" : ""}`} aria-labelledby={`${id}-etiquette`}>{valeur || "-"}</p>
        <small className="ec-aide-verrou"><Lock size={11} aria-hidden="true" /> {raisonDeLaLectureSeule}</small>
      </div>
    );
  }

  const decrit = [erreur ? `${id}-erreur` : "", aide ? `${id}-aide` : ""].filter(Boolean).join(" ") || undefined;
  const commun = {
    id,
    value: saisie,
    placeholder: indication,
    "aria-invalid": erreur ? true : undefined,
    "aria-describedby": decrit,
    onChange: (evenement: { target: { value: string } }) => {
      const nouvelle = evenement.target.value;
      setSaisie(nouvelle);
      // Chaque frappe se voit aussitôt sur le canevas, si elle a une forme acceptable.
      const propre = nouvelle.trim();
      if (onApercu && propre && !problemeDeForme(forme, propre)) onApercu(propre);
    },
    onFocus: () => {
      auDepart.current = valeur;
      setEnSaisie(true);
    },
    onBlur: () => {
      setEnSaisie(false);
      valider();
    },
    onKeyDown: auClavier,
    className: forme === "code" ? "technical-input" : undefined,
  };
  return (
    <div className="form-field">
      <label htmlFor={id}>{etiquette}</label>
      {multiligne ? <textarea rows={3} {...commun} /> : <input type="text" spellCheck={forme !== "code"} {...commun} />}
      {aide && !erreur && <small id={`${id}-aide`}>{aide}</small>}
      {erreur && <p className="ec-erreur-du-champ" id={`${id}-erreur`} role="alert">{erreur}</p>}
    </div>
  );
}

export interface Choix {
  readonly valeur: string;
  readonly libelle: string;
}

export interface ProprietesDUnChampChoix {
  readonly etiquette: string;
  readonly valeur: string;
  readonly choix: readonly Choix[];
  readonly onValider: (valeur: string) => ResultatDuChamp;
  readonly aide?: string;
  /** Le libellé de la valeur actuelle, si elle n'est pas parmi les choix (une reprise peut en porter une). */
  readonly libelleHorsListe?: string;
}

/** Une liste de choix : chaque choix est un geste, qui se voit tout de suite sur le canevas. */
export function ChampChoix({ etiquette, valeur, choix, onValider, aide, libelleHorsListe }: ProprietesDUnChampChoix) {
  const id = useId();
  const [erreur, setErreur] = useState<string | null>(null);
  const horsListe = !choix.some((un) => un.valeur === valeur);
  return (
    <div className="form-field">
      <label htmlFor={id}>{etiquette}</label>
      <select
        id={id}
        value={valeur}
        aria-invalid={erreur ? true : undefined}
        aria-describedby={erreur ? `${id}-erreur` : aide ? `${id}-aide` : undefined}
        onChange={(evenement) => {
          const refus = onValider(evenement.target.value);
          setErreur(refus ? refus.message : null);
        }}
      >
        {horsListe && <option value={valeur} disabled>{libelleHorsListe ?? (valeur || "À préciser")}</option>}
        {choix.map((un) => <option key={un.valeur} value={un.valeur}>{un.libelle}</option>)}
      </select>
      {aide && !erreur && <small id={`${id}-aide`}>{aide}</small>}
      {erreur && <p className="ec-erreur-du-champ" id={`${id}-erreur`} role="alert">{erreur}</p>}
    </div>
  );
}

/** Une valeur montrée sans pouvoir la changer, avec la raison. */
export function LectureSeule({ etiquette, valeur, raison }: { readonly etiquette: string; readonly valeur: string; readonly raison: string }) {
  const id = useId();
  return (
    <div className="form-field">
      <span id={id}>{etiquette}</span>
      <p className="ec-lecture" aria-labelledby={id}>{valeur}</p>
      <small className="ec-aide-verrou"><Lock size={11} aria-hidden="true" /> {raison}</small>
    </div>
  );
}

/** Un titre de section, comme dans l'ancien inspecteur. */
export function Section({ icone, children }: { readonly icone?: ReactNode; readonly children: ReactNode }) {
  return <div className="section-label">{icone}{children}</div>;
}

/** Une explication courte, sous un choix. */
export function Explication({ children }: { readonly children: ReactNode }) {
  return <div className="field-explanation"><Info size={14} aria-hidden="true" /><span>{children}</span></div>;
}
