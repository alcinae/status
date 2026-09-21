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

ELLE N'APPARAÎT PAS SUR status.alcinae.com. Upptime n'affiche que les issues
étiquetées `status`, et compte leur durée dans la disponibilité du service dont
elles portent le slug : poser ces étiquettes ici décompterait une indisponibilité
que la sonde n'a pas mesurée. Cette issue est donc une trace de travail, dont les
heures de création et de fermeture alimentent le registre des Incidents, seul
document qui fait preuve.

Le dépôt reste PUBLIC : son contenu est lisible par tous, même absent de la page.
-->

## Service concerné

<!-- Nom commercial, celui qu'emploient la page de statut et le registre. -->

## Constat

<!-- Ce qui a été observé, sans cause technique ni détail interne : jamais de
nom de client, de conteneur ni d'extrait de journal (voir MONITORING-EXTERNE.md
section 6). La règle vaut pour toute issue de ce dépôt public, affichée ou non. -->

## Heure de détection

<!-- Heure de Paris, à la minute. -->

## Rétablissement

<!-- À compléter à la fermeture de l'incident. -->

## Rappel de procédure

- [ ] Fermer cette issue au rétablissement, avec l'heure exacte.
- [ ] **Reporter la ligne `INC-...` dans `docs/deployment/incident-register.md` (dépôt privé `alcinae/alcinae`) le jour même**, à partir des heures d'ouverture et de fermeture de cette issue. C'est ce registre, jamais cette issue, qui fait preuve contractuelle (annexe 1 des CGA).
- [ ] Si le Client doit être informé, le faire par le canal habituel avec le modèle neutre de `docs/deployment/MONITORING-EXTERNE.md` : rien ne sera publié sur la page de statut, qui ne reflète que les sondes.
