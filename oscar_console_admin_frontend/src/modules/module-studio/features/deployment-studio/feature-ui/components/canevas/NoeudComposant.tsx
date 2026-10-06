import type { NodeProps } from "@xyflow/react";
import { CircleDot, Cpu, Database, Plus, Radio, ServerCog } from "lucide-react";
import { SORTES } from "../../../feature-domain/modele/types";
import { PICTOGRAMME_D_UNE_APPLICATION } from "../../familles";
import { useCanevas, useMarques } from "./contexte";
import LigneCanal from "./LigneCanal";
import type { GroupeDeCanaux, NoeudDeComposant, UniteAffichee } from "./disposition";

/**
 * Un service ou une application : le dessin riche de l'ancien éditeur (genre
 * en petites capitales, nom, code, zone, description), sur le nouveau
 * modèle. Chaque unité est une carte, avec les puces de sa structure et deux
 * colonnes : à gauche ses bus de réception (les entrées), à droite ses bus
 * d'émission (les sorties). Un bloc vide dit le geste suivant.
 *
 * Les hauteurs de chaque partie sont fixes, et égales à MESURES
 * (disposition.ts) : la zone qui contient le bloc se calcule sur elles.
 */

function Colonne({ groupes, entree }: { readonly groupes: readonly GroupeDeCanaux[]; readonly entree: boolean }) {
  const { onAjouter } = useCanevas();
  const nombre = groupes.reduce((total, groupe) => total + groupe.canaux.length, 0);
  const seul = groupes.length === 1 ? groupes[0] : undefined;
  const sorteDuCanal = entree ? SORTES.CANAL_RECEPTION : SORTES.CANAL_EMISSION;
  return (
    // Avec un seul bus de ce sens, toute la colonne le représente : on y dépose un canal.
    <div className={`ec-colonne ${entree ? "ec-colonne--entree" : "ec-colonne--sortie"}`} {...(seul ? { "data-cible-id": seul.bus.id } : {})}>
      <div className="ec-colonne__titre">
        <span>{entree ? "Réception" : "Émission"}</span>
        <small>{nombre}</small>
      </div>
      {groupes.length === 0 && <span className="ec-canal-vide">{entree ? "Aucun bus de réception" : "Aucun bus d’émission"}</span>}
      {groupes.map((groupe) => (
        <div key={groupe.bus.id} className="ec-bus" {...(seul ? {} : { "data-cible-id": groupe.bus.id })}>
          {/* Avec plusieurs bus du même sens, chacun dit son nom. */}
          {!seul && <span className="ec-bus__nom">{groupe.bus.nom ?? groupe.bus.code}</span>}
          {groupe.canaux.map((canal) => <LigneCanal canal={canal} key={canal.element.id} />)}
          {groupe.canaux.length === 0 && (
            <button
              type="button"
              className="ec-canal-vide ec-canal-vide--bouton nodrag"
              onClick={(evenement) => {
                evenement.stopPropagation();
                onAjouter(sorteDuCanal, groupe.bus.id);
              }}
            >
              <Plus size={11} aria-hidden="true" /> {entree ? "Ajouter une entrée" : "Ajouter une sortie"}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

function Unite({ unite }: { readonly unite: UniteAffichee }) {
  const { onSelectionner, problemes } = useCanevas();
  const marques = useMarques({ sorte: "element", id: unite.element.id });
  const nom = unite.element.nom ?? unite.element.code;
  const aRevoir = problemes.get(unite.element.id) ?? 0;
  const bande = unite.bandes[0];
  return (
    <section
      className={`ec-unite ${marques}`}
      aria-label={`Unité ${nom}`}
      data-cible-id={unite.element.id}
      onClick={(evenement) => {
        evenement.stopPropagation();
        onSelectionner({ sorte: "element", id: unite.element.id });
      }}
    >
      <div className="ec-unite__entete">
        <span className="ec-unite__icone"><Cpu size={15} aria-hidden="true" /></span>
        <span className="ec-unite__titre">
          <strong>{nom}</strong>
          <code>{unite.element.code}</code>
        </span>
        {aRevoir > 0 && <span className="ec-etat ec-etat--alerte">{aRevoir} à revoir</span>}
      </div>
      <div className="ec-unite__structure" aria-label="Structure créée avec l’unité">
        <span title={unite.traitement?.code ?? "absent"}><CircleDot size={12} aria-hidden="true" /> Traitement</span>
        <span title={unite.interfaceDeLUnite?.code ?? "absente"}><Radio size={12} aria-hidden="true" /> Interface</span>
        <span title={bande?.code ?? "absente"}><Database size={12} aria-hidden="true" /> {bande?.nom ?? "Bande"}</span>
      </div>
      <div className="ec-unite__colonnes">
        <Colonne groupes={unite.groupesDEntrees} entree />
        <Colonne groupes={unite.groupesDeSorties} entree={false} />
      </div>
    </section>
  );
}

export default function NoeudComposant({ data }: NodeProps<NoeudDeComposant>) {
  const { onAjouter, problemes } = useCanevas();
  const Pictogramme = data.application ? PICTOGRAMME_D_UNE_APPLICATION : ServerCog;
  const marques = useMarques({ sorte: "element", id: data.element.id });
  const aRevoir = problemes.get(data.element.id) ?? 0;
  const unites = data.unites.length;
  return (
    <article
      className={`ec-noeud ${data.application ? "ec-noeud--application" : "ec-noeud--service"} ${marques}`}
      data-cible-id={data.element.id}
    >
      <header className="ec-noeud__entete">
        <span className="ec-noeud__icone"><Pictogramme size={18} aria-hidden="true" /></span>
        <span className="ec-noeud__titre">
          <span className="ec-surtitre">{data.application ? "Application" : "Service"}</span>
          <strong>{data.element.nom ?? data.element.code}</strong>
        </span>
        {aRevoir > 0
          ? <span className="ec-etat ec-etat--alerte">{aRevoir} à revoir</span>
          : <span className="ec-etat">{unites} unité{unites > 1 ? "s" : ""}</span>}
      </header>
      <div className="ec-noeud__meta">
        <code>{data.element.code}</code>
        <span>{data.nomDeLaZone}</span>
      </div>
      {data.element.description && <p className="ec-noeud__description">{data.element.description}</p>}
      <div className="ec-noeud__unites">
        {data.unites.map((unite) => <Unite unite={unite} key={unite.element.id} />)}
        {unites === 0 && (
          <div className="ec-unite-vide">
            <Cpu size={18} aria-hidden="true" />
            <span>Déposez une unité ici, ou ajoutez-la avec le bouton.</span>
          </div>
        )}
        <button
          type="button"
          className="ec-ajouter-unite nodrag"
          onClick={(evenement) => {
            evenement.stopPropagation();
            onAjouter(SORTES.UNITE, data.element.id);
          }}
        >
          <Plus size={14} aria-hidden="true" /> Ajouter une unité
        </button>
      </div>
    </article>
  );
}
