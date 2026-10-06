import { useMemo, useState, type DragEvent } from "react";
import { AppWindow, Cpu, Search, Sparkles } from "lucide-react";
import { typesDeLaPalette } from "../../feature-domain/modele/possibilites";
import { NOMS_DES_SORTES } from "../../feature-domain/modele/regles";
import { SORTE_DU_BUNDLE, SORTES, type CatalogueStudio, type Sorte, type TypeDuCatalogue } from "../../feature-domain/modele/types";
import { presentationDeLaFamille } from "../familles";
import { correspond } from "../textes";

/**
 * La palette du Studio (conception du lot L1, parties 6.1 et 6.6), dans le
 * dessin de l'ancien éditeur : une recherche, une aide, puis les cartes,
 * rangées par familles dans l'ordre du catalogue. Chaque carte a son icône
 * colorée par genre, son nom, une ligne de description et son code. Une
 * famille sans entrée ne s'affiche pas.
 *
 * Une carte se glisse sur le canevas (une ombre du bloc suit le pointeur) ;
 * un clic, ou Entrée, l'ajoute dans l'élément sélectionné s'il la reçoit,
 * sinon propose où la mettre. La palette ne choisit jamais le parent : c'est
 * le pointeur, ou la sélection.
 */

/** Le format du glisser-déposer : le code et la version du type, rien d'autre. */
export const FORMAT_DU_GLISSEMENT = "application/x-oscar-studio-type";

/** La teinte de la carte, par genre, comme dans l'ancien éditeur. */
const TEINTES: Partial<Record<Sorte, string>> = {
  [SORTES.ZONE]: "zone",
  [SORTES.SALLE]: "violet",
  [SORTES.SERVICE]: "blue",
  [SORTES.APPLICATION]: "cyan",
  [SORTES.UNITE]: "amber",
  [SORTES.CANAL_RECEPTION]: "green",
  [SORTES.CANAL_EMISSION]: "rose",
};

/** « une zone d'environnement », « le bundle »... : où ce type se place, en mots. */
function ouIlSePlace(type: TypeDuCatalogue): string {
  return type.parents_autorises.map((parent) => {
    if (parent === SORTE_DU_BUNDLE) return "le bundle";
    const nom = NOMS_DES_SORTES[parent as Sorte];
    return nom ? nom.join(" ") : parent;
  }).join(" ou ");
}

/** Le pictogramme d'une carte : celui de sa famille, sauf l'application et l'unité, qui ont le leur. */
function pictogrammeDuType(type: TypeDuCatalogue) {
  if (type.sorte === SORTES.APPLICATION) return AppWindow;
  if (type.sorte === SORTES.UNITE) return Cpu;
  return presentationDeLaFamille(type.famille).pictogramme;
}

/**
 * L'ombre qui suit le pointeur pendant un glissement : un petit bloc qui
 * ressemble à ce qu'on dépose. Le navigateur la photographie au départ du
 * glissement ; l'élément peut ensuite quitter la page.
 */
function poserLOmbre(evenement: DragEvent<HTMLButtonElement>, type: TypeDuCatalogue): void {
  const ombre = document.createElement("div");
  ombre.className = `ec-ombre ec-ombre--${TEINTES[type.sorte as Sorte] ?? "neutre"}`;
  const genre = document.createElement("small");
  genre.textContent = NOMS_DES_SORTES[type.sorte as Sorte]?.[1] ?? "";
  const nom = document.createElement("strong");
  nom.textContent = type.nom;
  ombre.append(genre, nom);
  document.body.append(ombre);
  evenement.dataTransfer.setDragImage(ombre, 28, 22);
  window.setTimeout(() => ombre.remove(), 0);
}

export interface ProprietesDeLaPalette {
  readonly catalogue: CatalogueStudio;
  /** Clic ou Entrée sur une carte : l'ajouter dans la sélection, ou proposer où la mettre. */
  readonly onChoisir: (type: TypeDuCatalogue) => void;
  /** Une carte commence à glisser : le canevas éclaire les parents compatibles. */
  readonly onDebutDuGlissement: (type: TypeDuCatalogue) => void;
  readonly onFinDuGlissement: () => void;
}

export default function Palette({ catalogue, onChoisir, onDebutDuGlissement, onFinDuGlissement }: ProprietesDeLaPalette) {
  const [recherche, setRecherche] = useState("");
  const types = useMemo(() => typesDeLaPalette(catalogue), [catalogue]);

  // Les familles dans l'ordre du catalogue, chacune avec ses types qui répondent à la recherche ;
  // une famille vide ne s'affiche pas.
  const familles = useMemo(() => [...catalogue.familles]
    .sort((a, b) => a.ordre - b.ordre)
    .map((famille) => ({
      famille,
      types: types.filter((type) => type.famille === famille.code && correspond(type, recherche)),
    }))
    .filter(({ types: typesDeLaFamille }) => typesDeLaFamille.length > 0), [catalogue.familles, types, recherche]);

  const commencer = (evenement: DragEvent<HTMLButtonElement>, type: TypeDuCatalogue) => {
    evenement.dataTransfer.setData(FORMAT_DU_GLISSEMENT, JSON.stringify({ code: type.code, version: type.version }));
    evenement.dataTransfer.effectAllowed = "copy";
    poserLOmbre(evenement, type);
    onDebutDuGlissement(type);
  };

  return (
    <div className="ec-palette">
      <label className="library-search">
        <Search size={15} aria-hidden="true" />
        <span className="ec-invisible">Chercher dans la palette</span>
        <input
          type="search"
          value={recherche}
          placeholder="Rechercher un composant"
          onChange={(evenement) => setRecherche(evenement.target.value)}
        />
      </label>
      <div className="library-intro">
        <Sparkles size={16} aria-hidden="true" />
        <span>Glissez un composant sur le plan, ou cliquez pour l’ajouter dans l’élément choisi.</span>
      </div>
      {familles.length === 0 && (
        <p className="ec-palette__vide" role="status">Aucun composant ne correspond à « {recherche.trim()} ».</p>
      )}
      <div className="palette-list">
        {familles.map(({ famille, types: typesDeLaFamille }) => {
          const PictogrammeDeLaFamille = presentationDeLaFamille(famille.code).pictogramme;
          return (
            <section key={famille.code} className="ec-famille" aria-labelledby={`ec-famille-${famille.code}`}>
              <h3 id={`ec-famille-${famille.code}`} className="ec-famille__titre">
                <PictogrammeDeLaFamille size={13} aria-hidden="true" /> {famille.nom}
              </h3>
              <ul className="ec-famille__liste">
                {typesDeLaFamille.map((type) => {
                  const Pictogramme = pictogrammeDuType(type);
                  const aide = `${type.description} Se place dans ${ouIlSePlace(type)}. Exemple : ${type.exemple}`;
                  const idDeLAide = `ec-aide-${type.code}-${type.version}`;
                  return (
                    <li key={`${type.code}@${type.version}`}>
                      {/* Le nom suffit à nommer la carte ; l'aide (à quoi elle sert, où elle se place,
                          un exemple) se lit au survol et par un lecteur d'écran. */}
                      <span id={idDeLAide} className="ec-invisible">{aide}</span>
                      <button
                        type="button"
                        className={`palette-card palette-card--${TEINTES[type.sorte as Sorte] ?? "neutre"}`}
                        draggable
                        title={aide}
                        aria-label={type.nom}
                        aria-describedby={idDeLAide}
                        data-type-code={type.code}
                        onClick={() => onChoisir(type)}
                        onDragStart={(evenement) => commencer(evenement, type)}
                        onDragEnd={onFinDuGlissement}
                      >
                        <span className="palette-card__icon"><Pictogramme size={18} aria-hidden="true" /></span>
                        <span className="palette-card__copy">
                          <strong>{type.nom}</strong>
                          <small>{type.description}</small>
                          <code>{type.code}</code>
                        </span>
                        <span className="palette-card__grip" aria-hidden="true">⠿</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>
      <div className="library-note">
        <strong>Ajout intelligent</strong>
        <p>
          La première zone pose la salle temps réel. Un service ou une application arrive avec sa première unité ;
          une unité, avec son traitement, son interface, une bande et ses deux bus.
        </p>
      </div>
    </div>
  );
}
