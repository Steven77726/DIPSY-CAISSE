# DIPSY CAISSE

Caisse de restaurant tactile et responsive : commandes, paiements partiels et mixtes, carnet clients, journal d’opérations et exports comptables CSV/Excel.

Application indépendante de Dipsy Tables. Les données réelles utilisent exclusivement les tables `caisse_*` du projet Supabase `wseewiaaygyzkalpslee` (Paris). Le mode démonstration utilise des données fictives dans la session du navigateur.

## Développement

Node.js 24 et npm sont nécessaires.

```sh
npm ci
npm run dev
npm run check
```

L’URL `/?demo=1` ouvre une démonstration sans compte. Les prix de cette démonstration ne sont pas la carte réelle du restaurant.

## Accès et enregistrements

L’URL canonique est https://steven77726.github.io/DIPSY-CAISSE/ . À la demande explicite du propriétaire, elle ouvre directement **la vraie caisse partagée, sans compte ni mot de passe**. Toute personne disposant du lien peut consulter les clients, commandes et règlements, modifier la carte et enregistrer des opérations. La gestion des comptes reste réservée aux administrateurs authentifiés.

- Accès libre activé uniquement pour DIPSY CAISSE par `database/public-access.sql`. Un interrupteur serveur permet de revenir au mode Supabase Auth avec adresses vérifiées et liste d’accès.
- RLS sur toutes les tables ; aucune écriture REST directe, y compris pour l’administrateur.
- Seule la clé **publishable** apparaît dans le navigateur. Aucune clé `service_role`.
- Paiements atomiques, verrou de commande, version attendue et identifiants d’opération uniques.
- File IndexedDB durable avant envoi ; une réponse perdue rejoue le même identifiant.
- Les opérations en attente restent signalées et sont exclues des chiffres confirmés.
- Les prix, noms, groupes et taux de TVA sont figés sur chaque ligne existante.
- Les commandes comportant un règlement sont verrouillées ; remboursements et avoirs ne font pas partie de cette V1.

## Déploiement

Le workflow GitHub Actions vérifie calculs, stockage, synchronisation et PostgreSQL, construit puis publie GitHub Pages après chaque push validé sur `main`. Les pull requests exécutent les contrôles sans publier.

Activer **Settings → Pages → Source → GitHub Actions** dans le dépôt. Le mode libre n’exige aucune inscription. Conserver les URL Supabase Auth existantes pour le retour éventuel au mode protégé. Voir [le guide de mise en service](docs/DEPLOYMENT.md).

## Comptabilité

Les indicateurs de CA et de TVA du tableau de bord reposent sur la **date des encaissements en Europe/Paris**. Les paiements partiels sont répartis au centime sur les lignes ; CB + espèces = total encaissé. Les paiements mixtes sont une ventilation de ces mêmes paiements, sans ajout au total.

Le CSV contient le journal détaillé des encaissements. Le vrai classeur `.xlsx` contient Synthèse, Commandes, Lignes, Règlements et Ventilation TVA. Les commandes/lignes sont filtrées sur la création de commande et les règlements sur leur date de réception ; les onglets explicitent cette différence. Les taux restent choisis explicitement par produit. [Règles officielles de TVA](https://entreprendre.service-public.gouv.fr/vosdroits/F22399).

## Exploitation

- [Mise en service et déploiement](docs/DEPLOYMENT.md)
- [Sauvegarde et restauration](docs/RESTORE.md)
- [Architecture et limites de la V1](docs/ARCHITECTURE.md)
- [Vérifications effectuées](docs/VALIDATION.md)

La procédure de restauration est vérifiée automatiquement sur PostgreSQL embarqué avec des données de test. Les sauvegardes nocturnes externes sont fournies mais nécessitent leurs secrets et leur activation ; elles ne sont pas actives par défaut.
