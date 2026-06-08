# DRAFT — patient-facing muscle → function language (#4)

**Purpose.** Patients should not see anatomical muscle names. When a muscle is
shown to a patient (today: the "treated muscles" pop-up on the home screen, via
`TreatedMusclesModal`), they should see the **movement or posture the injection
is easing**, in plain language — e.g. "elbow bending", "foot turning inward".

**⚠ Two things for you to settle before I wire this in.**

1. **Free-text vs catalogue (data-model decision).** Body muscles are entered as
   **free text** on the treatment page (only the face map uses a fixed list). So
   there is nothing reliable to map against — "Gastrocnemius", "gastroc", "GCM",
   "calf" would all need to resolve to the same function. The robust fix is a
   **structured muscle catalogue**: the clinician picks the muscle from a list,
   and each entry carries (a) the clinical name they see and (b) the
   patient-facing function below. This table is that catalogue's first draft.
   The alternative — keep free text and best-effort map the string — is fragile
   and will silently fall back to showing the raw name. **My recommendation:
   structured catalogue.** (Implication: a small migration or a constant + a
   picker on the treatment page, and a fallback to the raw text for any legacy
   free-text muscle already stored.)

2. **Function depends on the goal, not just the muscle.** In spasticity we inject
   a muscle to reduce an *overactive* action. The plain-language description is
   "what we're easing", which is usually the muscle's main action — but a few
   muscles serve more than one (e.g. gastrocnemius also flexes the knee). I've
   written each row as the **dominant action treated in spasticity**; flag any
   you'd phrase differently or split.

**This is a draft for your correction** — you catch anatomical errors, so please
mark up the function column. en = English patient phrasing, da = Danish first
pass (native review pending). Names are the clinical labels for the picker.

---

## Lower limb

| Clinical muscle | Patient-facing function (en) | (da, draft) |
|---|---|---|
| Gastrocnemius | Pointing the foot down / toe-walking | At pege foden nedad / tågang |
| Soleus | Pointing the foot down (with bent knee) | At pege foden nedad (med bøjet knæ) |
| Tibialis posterior | Turning the foot inward | At dreje foden indad |
| Tibialis anterior | Lifting / turning up the foot | At løfte foden opad |
| Flexor digitorum longus | Curling the toes | At krølle tæerne |
| Flexor hallucis longus | Curling the big toe | At krølle storetåen |
| Extensor hallucis longus | Up-cocking the big toe | At strække storetåen opad |
| Peroneus longus / brevis | Turning the foot outward | At dreje foden udad |
| Rectus femoris | Stiff / straight knee when walking | Stift / strakt knæ ved gang |
| Hamstrings (semitendinosus / semimembranosus / biceps femoris) | Bent knee / difficulty straightening the knee | Bøjet knæ / svært ved at strække knæet |
| Hip adductors (adductor longus / magnus / gracilis) | Knees / thighs pulling together (scissoring) | Knæ / lår trækker sammen (saksegang) |
| Iliopsoas | Bent hip / difficulty straightening the hip | Bøjet hofte / svært ved at strække hoften |

## Upper limb

| Clinical muscle | Patient-facing function (en) | (da, draft) |
|---|---|---|
| Biceps brachii | Bending the elbow | At bøje albuen |
| Brachialis | Bending the elbow | At bøje albuen |
| Brachioradialis | Bending the elbow (forearm mid-position) | At bøje albuen (underarm i mellemstilling) |
| Pronator teres / quadratus | Turning the palm down | At dreje håndfladen nedad |
| Flexor carpi radialis | Bending the wrist | At bøje håndleddet |
| Flexor carpi ulnaris | Bending the wrist (toward the little-finger side) | At bøje håndleddet (mod lillefingersiden) |
| Flexor digitorum superficialis | Curling the fingers | At krølle fingrene |
| Flexor digitorum profundus | Curling the fingertips | At krølle fingerspidserne |
| Flexor pollicis longus | Curling the thumb | At krølle tommelen |
| Adductor pollicis / opponens | Thumb pulled into the palm | Tommel trukket ind i håndfladen |
| Pectoralis major | Arm pulled across the chest | Arm trukket ind foran brystet |
| Latissimus dorsi / teres major | Arm pulled down and in | Arm trukket nedad og ind |
| Subscapularis | Shoulder/arm turned inward | Skulder/arm drejet indad |

## Notes / open questions for you
- **Sides** are already shown separately (left/right/both), so the function text
  shouldn't repeat side.
- A few muscles share a function (e.g. biceps + brachialis = "bending the
  elbow"). When several treated muscles map to the same function, the patient
  pop-up could **collapse them to one line** ("bending the elbow") rather than
  repeating it — tell me if you'd like that.
- Anything missing from your usual injection set? Add rows and I'll fold them in.
- Once you've corrected this, I'll turn it into the catalogue + picker (treatment
  page) and switch `TreatedMusclesModal` to show the function, with a fallback to
  the raw text for any muscle stored before the catalogue existed.
