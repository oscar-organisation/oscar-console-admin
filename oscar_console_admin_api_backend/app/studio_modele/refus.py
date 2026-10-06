"""Un refus du Studio, avec son code en plus de son message.

L'interface ne garde que `detail` comme message (son client lit ce seul
champ) : un refus garde donc `detail` pour la phrase en français, et ajoute à
côté son code et ses précisions, que lisent les tests et le nouvel écran
(conception du lot L1, partie 5.1). app/main.py en fait la réponse.
"""


class RefusDuStudio(Exception):
    def __init__(self, statut: int, code: str, message: str, **precisions):
        super().__init__(message)
        self.statut = statut
        self.code = code
        self.message = message
        self.precisions = precisions

    def corps(self) -> dict:
        return {"detail": self.message, "code": self.code, **self.precisions}
