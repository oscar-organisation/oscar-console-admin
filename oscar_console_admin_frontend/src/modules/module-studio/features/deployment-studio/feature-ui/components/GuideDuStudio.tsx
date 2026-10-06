import { Keyboard, Sparkles, X } from "lucide-react";

/**
 * Le guide de démarrage, dans le dessin de l'ancien éditeur : les gestes
 * pour composer un bundle, puis les touches du clavier. Il s'ouvre la
 * première fois, puis par le bouton « Guide » de la barre du haut.
 */
export default function GuideDuStudio({ onFermer }: { readonly onFermer: () => void }) {
  return (
    <aside className="guide-card ec-guide" aria-label="Guide du Studio">
      <button className="icon-button" onClick={onFermer} type="button" aria-label="Fermer le guide"><X size={15} aria-hidden="true" /></button>
      <span className="guide-card__eyebrow"><Sparkles size={14} aria-hidden="true" /> Démarrage rapide</span>
      <strong>Composez de gauche à droite</strong>
      <ol>
        <li><b>Posez</b> une zone : robot, serveur, application web. La salle temps réel arrive avec la première.</li>
        <li><b>Déposez</b> un service ou une application dans sa zone : il arrive avec sa première unité.</li>
        <li><b>Ajoutez</b> les entrées et les sorties de chaque unité.</li>
        <li><b>Reliez</b> une sortie (point rose, à droite) à une entrée (point vert, à gauche).</li>
      </ol>
      <span className="guide-card__eyebrow"><Keyboard size={14} aria-hidden="true" /> Au clavier</span>
      <dl className="ec-guide__touches">
        <div><dt>Flèches</dt><dd>passer d’un élément à l’autre</dd></div>
        <div><dt>Entrée</dt><dd>ses propriétés</dd></div>
        <div><dt>A</dt><dd>ajouter dedans</dd></div>
        <div><dt>Suppr</dt><dd>supprimer, après confirmation</dd></div>
        <div><dt>Maj+flèches</dt><dd>déplacer le bloc</dd></div>
        <div><dt>Ctrl+Z, Ctrl+Y</dt><dd>annuler, rétablir</dd></div>
        <div><dt>Échap</dt><dd>fermer, puis tout désélectionner</dd></div>
      </dl>
      <button onClick={onFermer} type="button">J’ai compris</button>
    </aside>
  );
}
