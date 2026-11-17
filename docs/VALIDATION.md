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

## Encaissements successifs — 17 novembre 2026

La fenêtre reste ouverte après chaque versement confirmé. Sur une addition de 349 €, un versement CB de 49 € affiche immédiatement un solde confirmé de 300 €, puis permet de saisir le versement suivant avec la nouvelle version de la commande. Les totaux CB/espèces et l’historique proviennent uniquement des paiements présents dans l’instantané confirmé. Un accusé d’écriture dont l’instantané est retardé garde le formulaire verrouillé jusqu’à réception des paiements attendus.

16 tests applicatifs et 34 contrôles PostgreSQL réussis, compilation TypeScript et build Vite inclus. Deux tests supplémentaires couvrent les versements 49 € CB, 100 € espèces et 200 € CB sur la même commande, sa clôture exacte et le rendu du récapitulatif sans les paiements d’une autre commande.

Parcours navigateur avec le véritable moteur d’opérations et une base PostgreSQL temporaire isolée : double clic sur 49 € (un seul paiement), retard d’instantané (aucune déduction anticipée), versement de 100 € dont la réponse est perdue (même identifiant rejoué, une seule écriture), correction concurrente du solde (saisie conservée, validation bloquée avant acceptation explicite), puis règlement mixte final. La même fenêtre affiche la table entièrement encaissée, les modes de règlement, les articles et l’historique. Réouverture depuis « Réglées → Détail » contrôlée. Formats ordinateur, iPhone 390 × 844 et iPad 1024 × 768 vérifiés. Aucun paiement fictif n’a été envoyé au projet Supabase du restaurant.

## Utilisation iPhone et Mac — 17 novembre 2026

Boutons principaux et quantités agrandis à au moins 44 px. Sur téléphone, les encaissements utilisent des fiches avec solde et bouton accessibles sans défilement horizontal ; les statistiques passent après ces fiches. Les fenêtres Mac étroites utilisent aussi ces fiches. Une table ouvre directement son ticket sur téléphone et « Ajouter des produits » ramène à la carte. Les changements d’onglet reviennent en haut de page. Les marges réservées aux zones système, les champs de 16 px sur téléphone et le suivi de `visualViewport` adaptent les panneaux à l’espace visible sans désactiver le zoom utilisateur.

Les fenêtres modales ont un titre accessible, un bouton de fermeture restant visible et un défilement indépendant. Dans une fenêtre Mac de faible hauteur, les articles défilent dans le ticket et les actions restent accessibles. Les notifications mobiles sont décalées pour laisser le bouton du ticket libre.

Parcours de démonstration vérifiés dans le navigateur aux formats 320 × 568, 390 × 844, 900 × 600 et 1280 × 720 : ouverture de table, ajout de quantité, enregistrement, nouvelle commande libre, ajout d’un produit et validation, ouverture d’encaissement et versement partiel dans la même fenêtre. Une hauteur réduite à 390 × 420 confirme que les champs et la validation restent accessibles par défilement ; cela simule un espace réduit et ne remplace pas un essai du clavier sur un iPhone physique. Les 16 tests applicatifs et les 34 contrôles PostgreSQL restent réussis. Aucun changement de schéma ni de droits d’accès.

## iPad portrait et paysage — 17 novembre 2026

Entre 701 et 950 px, la carte occupe toute la largeur disponible avec trois colonnes de produits, et le ticket s’ouvre dans un panneau de 420 px avec de grands boutons. La sélection d’une table ouvre ce panneau ; un bouton fixe permet de retrouver le ticket. À partir de 951 px, la carte et le ticket sont affichés côte à côte. Les champs restent lisibles à 16 px dans le mode portrait compact.

Contrôle dans le navigateur à 768 × 1024 et 1024 × 768 : ouverture de Table 06, quantité de burrata de 2 à 3, enregistrement à 134 €, rotation en paysage, versement CB de 49 €, puis rotation en portrait. La même fenêtre affiche 49 € déjà encaissés et 85 € restants, avec l’historique et les boutons accessibles. Les 16 tests applicatifs et la compilation réussissent ; les contrôles PostgreSQL sont aussi exécutés par la publication automatique. Ces essais utilisent les formats iPad dans le navigateur et des données fictives.


## Reprise des tickets bloqués — 17 novembre 2026

Le ticket différencie une réponse réseau inconnue d’un refus explicite PostgreSQL. Une réponse inconnue reste dans la file et se vérifie avec le même identifiant ; aucune suppression ni nouvelle clé de paiement n’est autorisée. Un refus affiche sa cause et une action de reprise sur le ticket, le règlement ou la table. La tentative refusée est archivée dans le magasin IndexedDB `cache` (`rejected:<id>`) avant son retrait atomique de la file. Les archives restent propres à l’appareil.

Le sélecteur des nouveaux tickets indépendants propose les clients propres à Caisse ; un ancien ticket refusé pour association à un client de réservation peut reprendre sans cette association, en conservant ses articles. Les refus d’autosauvegarde attendent une correction utilisateur avant un nouvel envoi.

Sept régressions moteur supplémentaires couvrent le refus persistant, le conflit sans écrasement, la réponse de paiement perdue, les envois simultanés, le verrou d’un autre onglet, la rafale Realtime et la confirmation reçue dans un autre onglet. `npm run check` : 29 tests applicatifs et 61 vérifications PostgreSQL, restauration comprise.


## Carte partagée et retrait des tables — 17 novembre 2026

Les rubriques sont Plats, Vins, Cocktails, Boissons et Alcool. Les anciens produits Entrées/Desserts restent conservés et apparaissent parmi les plats. Le prix, la TVA et le groupe comptable restent propres au produit et indépendants de sa rubrique.

Les flèches de Carte & TVA envoient une opération `reorder_products` persistée avant le réseau. Le classement versionné par rubrique dans Supabase est la source de vérité des commandes et des paramètres. Une ancienne préférence locale n’est importée automatiquement que si aucun classement serveur n’a encore été défini ; une comparaison de version empêche l’écrasement concurrent. Une réponse inconnue garde son identifiant d’origine.

`test:catalog` vérifie aussi les retraits : texte de confirmation, conservation des soldes et règlements, disparition après libération, réemploi du nom, droits, concurrence et restauration. Les scénarios UI sont exécutés sur une caisse PostgreSQL embarquée isolée, avec des données fictives. Aucun ticket ni paiement réel de production n’est utilisé pour ces tests.

Validation finale de cette évolution : 34 tests applicatifs et 76 contrôles PostgreSQL (dont 15 pour le classement, le retrait et leur restauration), soit 110 contrôles. Les tests antérieurs de salle ont été adaptés à la disparition du carré après libération ; les vérifications des paiements et des historiques sont conservées.
