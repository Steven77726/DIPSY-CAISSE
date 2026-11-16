# Vérifications du 16 novembre 2026

## Automatique

`npm run check` : 11 tests applicatifs et 17 vérifications PostgreSQL réussis, puis compilation TypeScript et build Vite.

- Centimes, arrondis HT/TVA/TTC, dates de Paris et changements d’heure.
- Répartition de paiements partiels et mixtes, y compris des règlements d’un centime ; sommes réconciliées sans montant négatif.
- Stockage IndexedDB durable, idempotence de la clé locale et isolation entre utilisateurs.
- Réponse réseau perdue après enregistrement : le même identifiant est renvoyé, sans afficher le paiement comme confirmé entre-temps. Création hors ligne puis reprise au retour du réseau.
- CSV échappé et protégé contre les formules injectées ; vrai classeur XLSX relu, cinq onglets, montants numériques et total des règlements réconcilié.
- PostgreSQL : RLS, accès anonyme interdit, membre non autorisé interdit, utilisateur non confirmé interdit, restrictions personnel/admin et journaux d’accès protégés.
- Paiement atomique, répétition identique acceptée sans doublon, réutilisation de clé avec un autre contenu refusée, conflit de version, surpaiement, verrou après paiement et clôture exacte.
- Sauvegarde des neuf tables puis restauration sur une seconde base isolée, montants et réessai d’une ancienne clé vérifiés.

L’audit npm après correction des dépendances ne signale aucune vulnérabilité connue à cette date.

## Projet Supabase réel

Migration additive installée dans le projet `wseewiaaygyzkalpslee`, région Paris. Les neuf tables ont RLS ; les huit tables utiles à la synchronisation sont publiées dans `supabase_realtime`. Les écritures directes sont interdites à `anon` et `authenticated`. Une seule adresse initiale a été autorisée comme administrateur, séparément du code source public.

`database/integration-verification.sql` a été exécuté sur le serveur réel : commande, TVA, instantané, règlement mixte répété, conflit et surpaiement. La transaction a été annulée ; aucune donnée de test ne reste dans le restaurant. Les séquences peuvent conserver des écarts après cet essai, ce qui est normal pour une identité PostgreSQL.

L’analyse de sécurité Supabase ne signale aucune anomalie après installation. L’analyse de performance signale uniquement des index encore inutilisés sur la base neuve ; ils sont conservés pour les clés étrangères et les accès futurs.

## Interface

Aperçu vérifié dans le navigateur : commandes, ticket existant, encaissement partiel mixte simulé et tableau comptable. Formats contrôlés : ordinateur, iPad 1024 × 768 et iPhone 390 × 844. Le ticket mobile s’ouvre au-dessus de la carte ; les catégories et commandes défilent horizontalement et les tableaux disposent de leur propre défilement.

## À valider avec les comptes et appareils du restaurant

- Première inscription/confirmation d’adresse et SMTP : le propriétaire choisit lui-même son mot de passe.
- Synchronisation réelle entre deux utilisateurs/appareils connectés et interruption/reprise de leur réseau pendant un service d’essai.
- Carte réelle, taux de TVA et rapprochement des exports par la comptable.
- Première sauvegarde chiffrée externe et restauration réelle de ce dump après configuration des secrets. Le test automatique local ne remplace pas cet exercice d’exploitation.
