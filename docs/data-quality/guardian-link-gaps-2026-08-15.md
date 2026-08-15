# Guardian Link Gaps — 2026-08-15

> Internal student-record data. Do not publish this document on a public site.

This is a point-in-time production snapshot taken after guardian import run
[`31908261188`](https://github.com/DAUST-ORG/myDAUST/actions/runs/31908261188).
It is an operational follow-up list, not a live source of truth.

At the time of the snapshot:

- 298 active students existed.
- 244 guardian profiles existed.
- 242 distinct active students had at least one guardian link.
- 56 active students had no guardian link.
- 22 parent workbook rows remained unmatched.

The parent section intentionally excludes email addresses, phone numbers, and
addresses. Consult the private source workbook only when an authorized
registrar needs those details.

## Active students without a parent or guardian link

| Student                                | Student ID     |
| -------------------------------------- | -------------- |
| Abdelkarim Elfar                       | `S202612AE`    |
| Abdou Aziz Sall                        | `F202106AAS`   |
| Abdoulaye Ndiaye                       | `F20254ABN`    |
| Ablaye Faye                            | `S202612AF`    |
| Ahmadou lamine Seck                    | `S202614ALS`   |
| Aïssatou Jacqueline Ndiaye             | `S202626AJN`   |
| Aminata Diop                           | `S20265AD`     |
| Ammar Allaeldin AttaELHAJ Abd Alla     | `S20264AAAA`   |
| As Mbaye Gueye Ndiaye                  | `S20254AMGN`   |
| Assane LOUM                            | `S202517AL`    |
| Cheikh Mouhamadoul Khaly BA            | `F202325CMKB`  |
| Cheikh Mouhamed Fadal mbacke Dieng     | `S202625CMFMD` |
| cheikhoul khalifa serigne babacar Wade | `S202611CKSBW` |
| Cheikhouna Khadim Fall                 | `S202529CKF`   |
| Derrick Nana Takyi Boadi               | `S202313DNTB`  |
| Drissa Ousmane Mallé                   | `S202624DOM`   |
| Élisée Nipoye SENE                     | `S202615ENS`   |
| Fatou Kiné Gueye                       | `S20261FKG`    |
| Fatoumata Binta Diallo                 | `S202226FBD`   |
| HAMADOU SECK                           | `S202619HS`    |
| Ibrahima Khaliloullah Ndiaye           | `F202129IKN`   |
| Jeyni SY                               | `S202623JS`    |
| Jo.Pitt Biaya Ajibade                  | `F202023JBA`   |
| Khadim Thiam                           | `S202630KT`    |
| KONOMBO Azarielle Gervaise Benaja      | `S202618AGBK`  |
| Mamadou Falilou Mbacke Ndour           | `F202115MFMN`  |
| Mame Alimatou Sadiya Cisse             | `S20262MASC`   |
| Mame Diarra Bousso DIAW                | `F202405MDBD`  |
| Mansour Sarr                           | `S201817MS`    |
| Mariatou COMA                          | `S20267MC`     |
| Megh Zaï Andréa Mouckagni              | `F202009MZAM`  |
| Mohamed Akeem Cissokho                 | `S202623MAC`   |
| Mohamed Bachir Dieye                   | `F202101MBD`   |
| Mohamed Elimane Mbengue                | `S202611MEM`   |
| Mohammed Allaeldin AttaELHAJ Abdalla   | `S202622MAAA`  |
| Mor Talla Diouck                       | `S202613MTD`   |
| Mouaze Lo                              | `F202317ML`    |
| Mouhamadou Fadilou MBAYE               | `S202623MFM`   |
| Mouhamed Diop                          | `F201918MD`    |
| Moussa Amissou Bachir Koure            | `F202130MABK`  |
| Moussa Amissou Lamine Koure            | `F202002MALK`  |
| Nicholas Nana Osei                     | `S202409NNO`   |
| Oulimata Leye                          | `S20269OL`     |
| Saad Eldine BOUDIB                     | `F202425SEB`   |
| Serigne Bassirou Sarr Fall             | `S202527SBSF`  |
| Seydina Mouhamadoul Moustapha Lo       | `F202101SMMLO` |
| Seydina Mouhamed Diagne                | `F202111SMD`   |
| Seynabou Faye                          | `S201822SF`    |
| Sick Mamadou Sow                       | `F202121MSS`   |
| Sophie Ndong                           | `S202624SN`    |
| Soumaya Fall                           | `F202118SF`    |
| Tal Ibrahima                           | `F202520IT`    |
| Tikwende Steve Emmanuel KEBERE         | `F202420TSEK`  |
| Victory Ikenna Umeh                    | `S20261VIU`    |
| Yacine Ba                              | `F202112YB`    |
| Younoussa Diallo                       | `F202330YD`    |

## Parent workbook rows still unmatched

These rows must not be linked from name similarity alone. Obtain the student's
official student ID or another authoritative identifier first.

| Workbook row | Parent                    | Student supplied                   | Review note                                                                                |
| -----------: | ------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------ |
|            4 | Colette Gueye             | Joseph Loic Massa Ndong            | No credible active-student match; Sophie Ndong shares only the surname.                    |
|            5 | Ismaila Diagne            | Rokhaya Diagne                     | Several Diagne students exist, but none is named Rokhaya.                                  |
|           20 | Colonel Diouma Sow        | El Hadji Mamadou Sow               | Ambiguous between El Hadji Baba SOW (`F202513EBS`) and Sick Mamadou Sow (`F202121MSS`).    |
|           32 | Marie Dione               | Seydina Mouhamadou Moustapha Dione | Possible Seydina Mouhamadoul Moustapha Lo (`F202101SMMLO`), but the surname conflicts.     |
|           45 | Cheikh Seck               | Mouhamed Keba Seck                 | HAMADOU SECK (`S202619HS`) is only a weak name match.                                      |
|           51 | Diouma Sow                | Madjiguene Sow                     | Several Sow students exist, but none is named Madjiguene.                                  |
|           57 | Mamadou Baba Balde        | Seydina Mouhamad Al Amine Balde    | No active Balde student.                                                                   |
|           68 | Sokhna Ndoumbé Fall       | Pape Ousmane Bocoum                | Safiétou Bocoum (`F202415SB`) shares only the surname.                                     |
|           87 | Alassane BA               | Not supplied                       | Student name or student ID is required.                                                    |
|           90 | Malick Diallo             | Not supplied                       | Student name or student ID is required.                                                    |
|           98 | Abdou Goudiaby            | Ndeye Khady Goudiaby               | No active Goudiaby student.                                                                |
|          101 | Soukeyna Sall             | Amadou Coly Dieye                  | Mohamed Abdou latif Dieye (`F202524MALD`) is only a weak surname match.                    |
|          110 | Meskerem Grunitzky Bekele | Elinam Dedjene Komlan Grunitzky    | No active Grunitzky student.                                                               |
|          154 | Fanta Diop                | Not supplied                       | Student name or student ID is required.                                                    |
|          158 | Rokhaya Cisse             | Papa Abdoulaye Diop                | No candidate matches both the given names and surname.                                     |
|          177 | Lea Malam A Kotouo        | Yohanan David Doumbe Doumbe        | No active Doumbe student.                                                                  |
|          188 | Thierno Souleymane BA     | Dieynaba BA                        | First name matches two Diallo students, while the surname points to unrelated Ba students. |
|          236 | Ulrich Mandiouba          | Pathe Mbaye Mandiouba              | No active Mandiouba student.                                                               |
|          245 | Maguette Sarr             | Mouhamed Salla Albert Sarr         | Possible Mohamed Saly SARR (`F202521MSS`); verify the student ID before linking.           |
|          252 | William Songo             | Leeson Gloire Emmanuel Bouvey Goto | No active Goto student.                                                                    |
|          262 | Yacine Loum               | Fatima Ndiaye                      | Fatou Mané Ndiaye (`F202419FMN`) is a weak possible match; verify the student ID.          |
|          265 | Astou Bessane             | Rama Thalia Cabral                 | No active Cabral student.                                                                  |

## Resolved during the import follow-up

These rows are not part of the unmatched list above:

| Workbook row | Parent                  | Linked student                         |
| -----------: | ----------------------- | -------------------------------------- |
|           12 | Aminata Tall            | Adja Fatou Gora DIOUF (`S202412AFGD`)  |
|          181 | Kangue Fall             | Mouhamadou Rassoul Fall (`F202514MRF`) |
|          226 | Maimounatou Ndiaye Diop | Fatoumata Bintou Diop (`F202520FBD`)   |

No guardian login or invitation was generated as part of these three links.
