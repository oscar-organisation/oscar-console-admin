import { History } from "lucide-react";
import { Section } from "./champs";

/**
 * Ce que la reprise d'un ancien bundle a lu et qui n'a pas encore sa place
 * dans le modèle (la Box IA, la mise en route...) : montré tel quel, sans
 * pouvoir le changer (question Q12 de la conception, décision A53).
 */
export default function DonneesReprises({ donnees }: { readonly donnees: Readonly<Record<string, unknown>> | undefined }) {
  const entrees = Object.entries(donnees ?? {});
  if (entrees.length === 0) return null;
  return (
    <section aria-label="Réglages repris de l’ancien Studio">
      <Section icone={<History size={15} aria-hidden="true" />}>Repris de l’ancien Studio</Section>
      <div className="generated-structure">
        {entrees.map(([cle, valeur]) => (
          <div key={cle}>
            <History size={13} aria-hidden="true" />
            <span>{cle}</span>
            <code>{typeof valeur === "string" ? valeur : JSON.stringify(valeur)}</code>
          </div>
        ))}
      </div>
      <small className="ec-aide-verrou">Repris tels quels ; ils trouveront leur place avec le catalogue standard.</small>
    </section>
  );
}
