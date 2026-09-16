---
name: Incident (déclaration manuelle)
about: Déclarer un incident constaté manuellement, hors sonde automatique
title: "Incident : "
labels: incident
assignees: ''
---

<!--
Cette issue sert à déclarer un incident qui n'a pas été ouvert
automatiquement par une sonde Upptime (panne repérée par un client, un
opérateur, ou un incident qui ne se traduit pas par une réponse HTTP en
échec). Une panne détectée par une sonde ouvre déjà sa propre issue
automatiquement : ne pas dupliquer, commenter l'issue existante à la place.
-->

## Service concerné

<!-- Nom commercial tel qu'affiché sur la page de statut. -->

## Constat

<!-- Ce qui a été observé, sans cause technique ni détail interne (la page
publique ne montre jamais de nom de client, de conteneur ni d'extrait de
journal, voir MONITORING-EXTERNE.md section 6). -->

## Heure de détection

<!-- Heure de Paris, à la minute. -->

## Rétablissement

<!-- À compléter à la fermeture de l'incident. -->

## Rappel de procédure

- [ ] Publier l'état "enquête en cours" avec le modèle neutre de `docs/deployment/MONITORING-EXTERNE.md`.
- [ ] Fermer cette issue au rétablissement, avec l'heure exacte.
- [ ] **Reporter la ligne `INC-...` dans `docs/deployment/incident-register.md` (dépôt privé `alcinae/alcinae`) le jour même**, à partir des heures d'ouverture et de fermeture de cette issue. C'est ce registre, jamais cette issue publique, qui fait preuve contractuelle (annexe 1 des CGA).
- [ ] Vérifier que la page de statut n'annonce jamais une durée différente de celle du registre.
