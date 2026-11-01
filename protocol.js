/* Safety protocol · boundary map. Motion layer; see motion.js for the switch.
 *
 * The map is complete at rest: five nodes, the dashed gate connector and the
 * host band are served markup. With motion on, a small page rides the map
 * while the section is on screen (styles.css: .boundary-map.is-looping). It
 * is redacted at the rule pass, checked at review, turned away by the gate's
 * door and sealed at export. Off screen, or with motion off, nothing runs.
 */
(() => {
  "use strict";

  const motion = window.SemredMotion;
  const map = document.getElementById("boundaryMap");
  if (!motion || !map) return;

  let visible = false;
  const apply = () => map.classList.toggle("is-looping", visible && motion.enabled);

  motion.inView(map, inView => { visible = inView; apply(); }, { threshold: 0.2 });
  motion.onChange(apply);
})();
