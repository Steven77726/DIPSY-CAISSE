# Vérifications du 16 novembre 2026

## Automatique

`npm run check` : 12 tests applicatifs et 20 vérifications PostgreSQL réussis, puis compilation TypeScript et build Vite.

- Centimes, arrondis HT/TVA/TTC, dates de Paris et changements d’heure.
- Répartition de paiements partiels et mixtes, y compris des règlements d’un centime ; sommes réconciliées sans montant négatif.
- Stockage IndexedDB durable, idempotence de la clé locale et isolation entre utilisateurs.
- Réponse réseau perdue après enregistrement : le même identifiant est renvoyé, sans afficher le paiement comme confirmé entre-temps. Création hors ligne puis reprise au retour du réseau.
- Mode libre : ouverture réelle sans connexion malgré une ancienne session privée ; création hors ligne, rechargement et reprise de la même file avec le même identifiant d’appareil.
- Accès libre PostgreSQL : lecture métier et paiements autorisés, comptes et réglage d’ouverture protégés, désactivation immédiate côté serveur.
- CSV échappé et protégé contre les formules injectées ; vrai classeur XLSX relu, cinq onglets, montants numériques et total des règlements réconcilié.
- PostgreSQL : RLS, accès anonyme refusé lorsque l’interrupteur est désactivé, membre non autorisé interdit, utilisateur non confirmé interdit, restrictions personnel/admin et journaux d’accès protégés.
- Paiement atomique, répétition identique acceptée sans doublon, réutilisation de clé avec un autre contenu refusée, conflit de version, surpaiement, verrou après paiement et clôture exacte.
- Sauvegarde des dix tables puis restauration sur une seconde base isolée, montants et réessai d’une ancienne clé vérifiés.

L’audit npm après correction des dépendances ne signale aucune vulnérabilité connue à cette date.

## Projet Supabase réel

Migrations additives installées dans le projet `wseewiaaygyzkalpslee`, région Paris. Les dix tables ont RLS ; les huit tables utiles à la synchronisation sont publiées dans `supabase_realtime`. Les écritures directes sont interdites à `anon` et `authenticated`. Une seule adresse initiale a été autorisée comme administrateur, séparément du code source public.

`database/integration-verification.sql` a été exécuté sur le serveur réel : commande, TVA, instantané, règlement mixte répété, conflit et surpaiement. La transaction a été annulée ; aucune donnée de test ne reste dans le restaurant. Les séquences peuvent conserver des écarts après cet essai, ce qui est normal pour une identité PostgreSQL.

L’analyse de sécurité ne signale aucune anomalie RLS ou SQL. Elle indique que la protection globale Auth contre les mots de passe compromis est désactivée ; ce réglage partagé n’est pas modifié pour ouvrir la caisse sans mot de passe. [Documentation Supabase](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). `database/public-access-verification.sql` a aussi réussi sous le vrai rôle `anon` : commande, paiement mixte, répétition, conflit, surpaiement, TVA, lecture et absence de droits directs. Toutes ses données sont annulées à la fin.

L’analyse de performance signale uniquement des index encore inutilisés sur la base neuve ; ils sont conservés pour les clés étrangères et les accès futurs.

## Interface

Aperçu vérifié dans le navigateur : commandes, ticket existant, encaissement partiel mixte simulé et tableau comptable. Formats contrôlés : ordinateur, iPad 1024 × 768 et iPhone 390 × 844. Le ticket mobile s’ouvre au-dessus de la carte ; les catégories et commandes défilent horizontalement et les tableaux disposent de leur propre défilement.

## À valider avec les appareils du restaurant

- En cas de retour au mode protégé uniquement : première inscription/confirmation d’adresse et SMTP.
- Synchronisation réelle entre deux appareils et interruption/reprise de leur réseau pendant un service d’essai.
- Carte réelle, taux de TVA et rapprochement des exports par la comptable.
- Première sauvegarde chiffrée externe et restauration réelle de ce dump après configuration des secrets. Le test automatique local ne remplace pas cet exercice d’exploitation.

## Correction des boutons de commande

Les deux boutons « Nouvelle commande » ouvrent un formulaire de table/commande libre. Fermer le formulaire conserve le ticket précédent. Un brouillon non envoyé est signalé avant remplacement. Sur mobile, la confirmation ouvre le ticket avec un bouton « Ajouter des produits » pour revenir à la carte.

Parcours contrôlé dans le navigateur : choix de Table 01, ajout d’un produit, quantité de 1 à 2, ouverture puis fermeture du second bouton « + » avec conservation du brouillon, enregistrement, modification de quantité et nouvel enregistrement. Les articles et totaux restent visibles après confirmation grâce au chargement du dernier instantané reçu. Contrôle complémentaire en 390 × 844 : commande libre nommée, ticket ouvert et bouton d’ajout visible. Toutes les commandes de ce parcours utilisent la démonstration locale.

## Passerelle — 17 novembre 2026

14 tests applicatifs, 20 contrôles caisse historiques, 14 contrôles PostgreSQL de passerelle (dont restauration des quinze tables) et 7 tests de migration Tables réussis. Les exemples d’exports utilisent une heure de référence fixe pour rester vérifiables après minuit à Paris.

Le parcours navigateur isolé a vérifié deux homonymes, une migration confirmée, l’ouverture de la seconde réservation avec son téléphone, sa date et sa table, la conservation de la même commande après réouverture, un article enregistré, les corrections dans les deux sens et la conservation d’une saisie pendant une correction concurrente. Les origines et données de test restent distinctes des applications réelles. La migration réelle des données locales doit être confirmée sur les appareils du restaurant.
