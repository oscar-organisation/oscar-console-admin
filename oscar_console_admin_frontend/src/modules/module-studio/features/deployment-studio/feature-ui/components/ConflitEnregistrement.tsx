import { GitCompareArrows } from "lucide-react";
import type { BrouillonServeur } from "../../feature-data/studioApi";
import { aucuneDifference, differences, type Differences } from "../../feature-domain/modele/differences";
import { nomAffiche } from "../../feature-domain/modele/possibilites";
import type { EtatStudio, ModeleBundle } from "../../feature-domain/modele/types";
import FenetreDuStudio from "./FenetreDuStudio";

/**
 * Le conflit d'enregistrement (conception du lot L1, partie 6.3) : un autre
 * poste a enregistré ce bundle pendant qu'on le modifiait ici. Rien n'est
 * écrasé : la fenêtre montre ce qui diffère de chaque côté, depuis la dernière
 * version commune, et propose deux choix explicites.
 */

function Cote({ titre, ecarts, modele }: { readonly titre: string; readonly ecarts: Differences | null; readonly modele: ModeleBundle | null }) {
  if (!ecarts || !modele) {
    return (
      <section className="ec-conflit__cote">
        <h3>{titre}</h3>
        <p className="ec-texte-discret">La version du serveur n’a pas pu être relue ; les deux choix restent possibles.</p>
      </section>
    );
  }
  const lignes: string[] = [];
  const noms = (elements: readonly { nom?: string; code: string }[]) => elements.slice(0, 4)
    .map((element) => `« ${nomAffiche(element as Parameters<typeof nomAffiche>[0])} »`).join(", ") + (elements.length > 4 ? "..." : "");
  if (ecarts.enTeteModifiee) lignes.push("Le nom, le code ou la description du bundle.");
  if (ecarts.ajoutes.length > 0) lignes.push(`${ecarts.ajoutes.length} élément${ecarts.ajoutes.length > 1 ? "s" : ""} ajouté${ecarts.ajoutes.length > 1 ? "s" : ""} : ${noms(ecarts.ajoutes)}.`);
  if (ecarts.retires.length > 0) lignes.push(`${ecarts.retires.length} retiré${ecarts.retires.length > 1 ? "s" : ""} : ${noms(ecarts.retires)}.`);
  if (ecarts.modifies.length > 0) lignes.push(`${ecarts.modifies.length} modifié${ecarts.modifies.length > 1 ? "s" : ""} : ${noms(ecarts.modifies)}.`);
  const liaisons = ecarts.liaisonsAjoutees.length + ecarts.liaisonsRetirees.length;
  if (liaisons > 0) lignes.push(`${liaisons} liaison${liaisons > 1 ? "s" : ""} ajoutée${liaisons > 1 ? "s" : ""} ou retirée${liaisons > 1 ? "s" : ""}.`);
  return (
    <section className="ec-conflit__cote">
      <h3>{titre}</h3>
      {aucuneDifference(ecarts)
        ? <p className="ec-texte-discret">Seule la disposition des blocs a changé.</p>
        : <ul className="ec-liste-simple">{lignes.map((ligne) => <li key={ligne}>{ligne}</li>)}</ul>}
    </section>
  );
}

export interface ProprietesDuConflit {
  readonly base: EtatStudio | null;
  readonly present: EtatStudio;
  readonly serveur: BrouillonServeur | null;
  readonly message: string | null;
  readonly onOuvrirLaVersionDuServeur: () => void;
  readonly onRemplacer: () => void;
}

export default function ConflitEnregistrement({ base, present, serveur, message, onOuvrirLaVersionDuServeur, onRemplacer }: ProprietesDuConflit) {
  const miens = base ? differences(base.modele, present.modele) : null;
  const leurs = base && serveur ? differences(base.modele, serveur.modele) : null;
  return (
    <FenetreDuStudio
      surtitre="Conflit avec un autre poste"
      titre="Ce bundle a été enregistré ailleurs"
      icone={<GitCompareArrows size={20} aria-hidden="true" />}
      focusInitial='[data-action="principal"]'
      classe="ec-fenetre--large"
      actions={(
        <>
          <button className="secondary-button" type="button" onClick={onRemplacer}>Remplacer la version du serveur par la mienne</button>
          <button className="primary-button" type="button" data-action="principal" onClick={onOuvrirLaVersionDuServeur}>Ouvrir la version du serveur</button>
        </>
      )}
    >
      <p>
        {message ?? "Un autre poste a enregistré ce bundle pendant que vous le modifiiez ici."}
        {" "}Rien n’a été écrasé, et rien ne part tant que vous n’avez pas choisi.
      </p>
      <div className="ec-conflit">
        <Cote titre="Vos changements, sur ce poste" ecarts={miens} modele={present.modele} />
        <Cote titre={`Ceux de l’autre poste${serveur ? ` (révision ${serveur.revision})` : ""}`} ecarts={leurs} modele={serveur?.modele ?? null} />
      </div>
      <p className="ec-texte-discret">
        Ouvrir la version du serveur écarte vos changements (la copie de ce poste s’efface) ; remplacer la version du
        serveur écarte ceux de l’autre poste. Le Studio ne fusionne jamais à votre place.
      </p>
    </FenetreDuStudio>
  );
}
