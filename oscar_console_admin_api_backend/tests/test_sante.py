"""La santé de l'API dit aussi si sa base de données répond.

Le contrôle de santé de la composition et le déploiement automatique lisent la
route /health. Si elle répondait 200 sans pouvoir lire la base, l'API se dirait
saine alors qu'aucune page de la console ne marcherait: une santé utile vise une
route qui peut échouer.
"""
from sqlalchemy import create_engine


def test_sante_200_quand_la_base_repond(client):
    r = client.get("/health")
    assert r.status_code == 200
    corps = r.json()
    assert corps["status"] == "ok"
    assert corps["database"] == "ok"


def test_sante_503_quand_la_base_ne_repond_pas(client, monkeypatch, tmp_path):
    # Une base qu'on ne peut pas ouvrir: un fichier dans un dossier qui n'existe pas.
    base_injoignable = create_engine(f"sqlite:///{tmp_path / 'absent' / 'base.db'}")
    monkeypatch.setattr("app.main.engine", base_injoignable)

    r = client.get("/health")

    assert r.status_code == 503
    corps = r.json()
    assert corps["status"] == "error"
    assert corps["database"] == "unreachable"
