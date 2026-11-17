# Tables autonomes de Dipsy Caisse

L’application existante s’ouvre depuis https://steven77726.github.io/DIPSY-CAISSE/ sans `reservation_id` ni session Dipsy Tables. Elle utilise son client Supabase, son stockage local et son propre abonnement Realtime. Aucun fichier de Dipsy Tables n’est modifié. Les anciennes fiches et réservations restent conservées.

Dans Commandes, « Créer une table » ajoute une table propre à la caisse. Sélectionner une table puis « Renommer » permet un nom personnalisé. L’identifiant UUID reste stable ; le nom n’est jamais une clé de liaison. Les anciennes tables liées à la passerelle gardent leur historique et ne deviennent pas des tables autonomes.

## Couleurs et cycle

- Gris : libre ou ticket en préparation, service pas encore lancé.
- Vert : commande validée, service lancé ; un versement partiel conserve le vert.
- Rouge : ticket intégralement payé, occupation conservée jusqu’au clic sur « Libérer la table ».

La libération clôture uniquement l’occupation. Elle ne supprime ni commande, ni article, ni TVA, ni paiement. Le prochain service reçoit un nouvel identifiant de commande. L’historique reste accessible via les encaissements réglés. Les annulations sans paiement clôturent leur occupation avec leur historique.

## Enregistrement automatique et concurrence

Chaque table conserve un brouillon distinct dans le stockage local de la caisse. Un changement de table n’abandonne pas le ticket. Les modifications sont envoyées automatiquement après 650 ms ; les brouillons des tables quittées sont également traités. Le stockage local est écrit avant tout envoi. Une réponse tardive ne remplace jamais une saisie plus récente. Les anciens brouillons de session sont repris sans effacement.

Les états de couleur proviennent de `caisse_snapshot()` confirmé par Supabase. Une opération locale ou en attente reste signalée explicitement. La file IndexedDB renvoie la même clé après une coupure ou une réponse perdue. Les anciennes versions sont refusées, sans écrasement silencieux.

`caisse_table_sessions` conserve l’occupation et son ticket. Un index unique partiel interdit deux occupations actives pour la même table. Les opérations de table sont sérialisées avec les commandes et paiements ; la libération vérifie à la fois la version d’occupation, celle du ticket et son solde exact. Les RPC contrôlent les droits, les écritures REST directes restent interdites et RLS filtre les lectures. Aucun secret serveur n’est envoyé au navigateur.

## Vérification

Treize contrôles PostgreSQL couvrent création, renommage, occupation unique, retrait du dernier article, lancement, paiements partiels, clôture rouge, libération idempotente, nouveau service et restauration. Un test de mise à niveau conserve un ancien ticket payé et vérifie le raccordement de la RPC après migration. Les tests de brouillons couvrent le changement de table, la relecture locale, les réponses tardives et les trois couleurs. Les tests existants de TVA, articles, droits, paiement et passerelle restent actifs.
