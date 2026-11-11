/* ================================================================
   乘客系统：低模人体 + 行走动画 + 上下车乘降 + 换乘通道真实客流
   ================================================================ */
const AXIS_X = new THREE.Vector3(1, 0, 0);
const CROWD_UP = new THREE.Vector3(0, 1, 0);
const CROWD_CLOTHES = ['#2c3a4a', '#3d3a35', '#1f242a', '#4a4f57', '#6b5a4a', '#8a929a', '#39434a', '#5b4a55', '#7a2f33', '#2f4a5a', '#5a6b4a', '#c9c3b6', '#8a5a3a', '#334a5c'];
const CROWD_SKIN = ['#d9b391', '#c99a76', '#a8764f', '#e2c2a4', '#b98a63'];
const CROWD_HAIR = ['#141416', '#241a15', '#3a2a20', '#4a3a2c', '#2a2a2e'];

class StationCrowd {
  constructor(parent, st, underground, pt, doorsZ) {
    this.pt = pt;
    this.doors = doorsZ.slice().sort((a, b) => a - b);
    this.hasTransfer = !!(st && st.tr && st.tr.length);
    this.trCount = this.hasTransfer ? 14 : 0;
    this.N = 54 + this.trCount;
    this.waitingCount = G.tod === 'night' ? 13 : G.tod === 'day' ? 30 : 24;
    this.rng = mulberry32(9001 + st.index * 137);
    this.exchanged = false;
    this.boardDelay = 0;
    this.boardQueue = [];
    this.acc = 0;
    this.group = new THREE.Group();
    parent.add(this.group);
    this.dummy = new THREE.Object3D();
    this._q = new THREE.Quaternion();
    this._q2 = new THREE.Quaternion();
    this._v = new THREE.Vector3();
    this.build();
    this.reset();
  }

  build() {
    const N = this.N;
    const bodyGeo = new THREE.CapsuleGeometry(0.19, 0.42, 4, 8);
    const headGeo = new THREE.SphereGeometry(0.118, 10, 8);
    const hairGeo = new THREE.SphereGeometry(0.122, 10, 8, 0, TAU, 0, PI * 0.56);
    const legGeo = new THREE.BoxGeometry(0.135, 0.72, 0.16); legGeo.translate(0, -0.36, 0);
    const armGeo = new THREE.BoxGeometry(0.1, 0.47, 0.115); armGeo.translate(0, -0.235, 0);

    const matBody = new THREE.MeshStandardMaterial({ roughness: 0.86, metalness: 0.02 });
    const matSkin = new THREE.MeshStandardMaterial({ roughness: 0.78, metalness: 0.0 });
    const matHair = new THREE.MeshStandardMaterial({ roughness: 0.72, metalness: 0.05 });
    const matLeg = new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0.02 });
    const matArm = new THREE.MeshStandardMaterial({ roughness: 0.86, metalness: 0.02 });

    const mk = (geo, mat) => {
      const m = new THREE.InstancedMesh(geo, mat, N);
      m.frustumCulled = false;
      m.castShadow = false; m.receiveShadow = false;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.group.add(m);
      return m;
    };
    this.body = mk(bodyGeo, matBody);
    this.head = mk(headGeo, matSkin);
    this.hair = mk(hairGeo, matHair);
    this.legL = mk(legGeo, matLeg);
    this.legR = mk(legGeo, matLeg);
    this.armL = mk(armGeo, matArm);
    this.armR = mk(armGeo, matArm);

    this.colBody = [];
    this.colSkin = [];
    this.colHair = [];
    for (let i = 0; i < N; i++) {
      this.colBody.push(new THREE.Color(CROWD_CLOTHES[Math.floor(this.rng() * CROWD_CLOTHES.length)]));
      this.colSkin.push(new THREE.Color(CROWD_SKIN[Math.floor(this.rng() * CROWD_SKIN.length)]));
      this.colHair.push(new THREE.Color(CROWD_HAIR[Math.floor(this.rng() * CROWD_HAIR.length)]));
      this.body.setColorAt(i, this.colBody[i]);
      this.armL.setColorAt(i, this.colBody[i]);
      this.armR.setColorAt(i, this.colBody[i]);
      this.head.setColorAt(i, this.colSkin[i]);
      this.hair.setColorAt(i, this.colHair[i]);
      const legCol = new THREE.Color(['#2b3038', '#343a42', '#3d4048', '#2e3540', '#464a50'][Math.floor(this.rng() * 5)]);
      this.legL.setColorAt(i, legCol);
      this.legR.setColorAt(i, legCol);
    }
    [this.body, this.head, this.hair, this.armL, this.armR, this.legL, this.legR].forEach(m => {
      m.instanceColor.needsUpdate = true;
    });
  }

  reset() {
    this.exchanged = false;
    const rng = this.rng;
    this.people = [];
    const baseN = this.N - this.trCount;
    for (let i = 0; i < this.N; i++) {
      if (i >= baseN) {
        // 换乘通道双向真实客流（往返于站台 z∈[35,70] 与换乘分流大厅 z∈[70,100]）
        const k = i - baseN;
        const toHall = (k % 2) === 0;
        const laneMag = 0.82 + (k % 4) * 0.45;
        const x = toHall ? laneMag : -laneMag;
        const z = 54 + (k / Math.max(1, this.trCount)) * 44;
        const portalX = (k % 3 === 0) ? -3.6 : (k % 3 === 1 ? 3.6 : (k % 4 === 0 ? -2.3 : 2.3));
        this.people.push({
          x, z,
          tx: toHall ? portalX : (-2.9 + (k % 5) * 0.55),
          tz: toHall ? (96.8 + (k % 3) * 1.4) : (12 + (k % 6) * 8.5),
          laneX: laneMag,
          portalX,
          role: 'transfer',
          state: toHall ? 'tr_to_hall' : 'tr_to_plat',
          rot: toHall ? 0 : PI,
          phase: rng() * TAU,
          speed: 1.32 + (k % 4) * 0.14,
          h: 0.9 + rng() * 0.12,
          scale: 1,
          fade: 0,
          moving: true
        });
        continue;
      }
      const spare = i >= this.waitingCount;
      let x = -3.4 + rng() * 6.6;
      let z = (rng() - 0.5) * 128;
      // 避开楼扶梯洞口
      if (Math.abs(Math.abs(z) - 44) < 6 && Math.abs(x) < 2.4) z += 14;
      this.people.push({
        x: spare ? -24 : x,
        z: spare ? 0 : z,
        tx: 0, tz: 0,
        state: spare ? 'spare' : 'wait',
        rot: PI / 2 + (rng() - 0.5) * 0.7,
        phase: rng() * TAU,
        speed: 0,
        h: 0.9 + rng() * 0.12,
        scale: spare ? 0 : 1,
        fade: 0,
        moving: false
      });
    }
    for (let i = 0; i < this.N; i++) {
      if (this.people[i].state === 'spare') this.zeroInstance(i);
    }
    this.update(0, 0, true);
  }

  transferringCount() {
    let c = 0;
    for (const p of this.people) {
      if (p.state === 'tr_to_hall' || p.state === 'tr_to_plat' || p.z > 68) c++;
    }
    return c;
  }

  zeroInstance(i) {
    const d = this.dummy;
    d.position.set(0, -50, 0);
    d.quaternion.identity();
    d.scale.set(0.0001, 0.0001, 0.0001);
    d.updateMatrix();
    [this.body, this.head, this.hair, this.legL, this.legR, this.armL, this.armR].forEach(m => m.setMatrixAt(i, d.matrix));
    [this.body, this.head, this.hair, this.legL, this.legR, this.armL, this.armR].forEach(m => { m.instanceMatrix.needsUpdate = true; });
  }

  update(dt, doorT, force = false) {
    if (doorT > 0.72 && !this.exchanged) this.startExchange();
    if (this.boardDelay > 0) {
      this.boardDelay -= dt;
      if (this.boardDelay <= 0) this.startBoarding();
    }
    if (doorT < 0.12) {
      for (const p of this.people) if (p.state === 'board') { p.state = 'wait'; p.speed = 0; }
    }
    const N = this.N;
    const t = performance.now() * 0.001;
    const d = this.dummy, q = this._q, q2 = this._q2, v = this._v;

    for (let i = 0; i < N; i++) {
      const p = this.people[i];
      if (p.state === 'spare') continue;
      if (p.scale <= 0.001 && p.state === 'gone') continue;

      // 换乘通道客流：右侧通道走向换乘大厅门洞（tr_to_hall），左侧通道走回站台（tr_to_plat）
      if (p.state === 'tr_to_hall') {
        const targetX = p.z < 91.0 ? (p.laneX || 1.25) : (p.portalX || 2.4);
        const targetZ = p.z < 91.0 ? 92.0 : p.tz;
        const dx = targetX - p.x, dz = targetZ - p.z;
        const dist = Math.hypot(dx, dz);
        if (p.z >= 91.0 && dist < 0.35) {
          p.state = 'tr_to_plat';
          p.x = -(0.85 + (i % 4) * 0.42);
          p.z = 98.0 + (i % 3) * 1.1;
          p.laneX = Math.abs(p.x);
          p.tx = -2.9 + (i % 5) * 0.5;
          p.tz = 10 + (i % 7) * 8.2;
          p.rot = PI;
          p.moving = true;
        } else if (dist > 0.01) {
          const sp = p.speed * dt;
          p.x += dx / dist * Math.min(sp, dist);
          p.z += dz / dist * Math.min(sp, dist);
          const targetRot = Math.atan2(dx, dz);
          let dr = targetRot - p.rot;
          while (dr > PI) dr -= TAU;
          while (dr < -PI) dr += TAU;
          p.rot += dr * Math.min(1, dt * 7);
          p.phase += dt * 8.4;
          p.moving = true;
        }
      } else if (p.state === 'tr_to_plat') {
        const targetX = p.z > 69.5 ? -(p.laneX || 1.25) : p.tx;
        const targetZ = p.z > 69.5 ? 68.5 : p.tz;
        const dx = targetX - p.x, dz = targetZ - p.z;
        const dist = Math.hypot(dx, dz);
        if (p.z <= 69.5 && dist < 0.35) {
          p.state = 'tr_to_hall';
          p.laneX = 0.85 + (i % 4) * 0.42;
          p.portalX = (i % 2 === 0 ? -3.4 : 3.4);
          p.tz = 97.2 + (i % 3) * 1.3;
          p.moving = true;
        } else if (dist > 0.01) {
          const sp = p.speed * dt;
          p.x += dx / dist * Math.min(sp, dist);
          p.z += dz / dist * Math.min(sp, dist);
          const targetRot = Math.atan2(dx, dz);
          let dr = targetRot - p.rot;
          while (dr > PI) dr -= TAU;
          while (dr < -PI) dr += TAU;
          p.rot += dr * Math.min(1, dt * 7);
          p.phase += dt * 8.4;
          p.moving = true;
        }
      } else if (p.state === 'board' || p.state === 'alight' || p.state === 'leave') {
        // 站台上下车行走
        const dx = p.tx - p.x, dz = p.tz - p.z;
        const dist = Math.hypot(dx, dz);
        if (dist > 0.28) {
          const sp = p.speed * dt;
          p.x += dx / dist * Math.min(sp, dist);
          p.z += dz / dist * Math.min(sp, dist);
          const targetRot = Math.atan2(dx, dz);
          let dr = targetRot - p.rot;
          while (dr > PI) dr -= TAU;
          while (dr < -PI) dr += TAU;
          p.rot += dr * Math.min(1, dt * 7);
          p.phase += dt * 8.4;
          p.moving = true;
        } else {
          p.moving = false;
          if (p.state === 'board') { p.state = 'gone'; p.fade = 0.32; }
          else if (p.state === 'alight') {
            if (this.hasTransfer && (i % 2 === 0)) {
              p.state = 'tr_to_hall';
              p.laneX = 0.85 + (i % 4) * 0.4;
              p.portalX = (i % 3 === 0) ? -3.2 : 3.2;
              p.tz = 97.2 + (i % 3) * 1.2;
              p.moving = true;
            } else {
              p.state = 'leave'; p.tx = -0.9; p.tz = p.z > 0 ? 44 : -44;
            }
          }
          else if (p.state === 'leave') { p.state = 'gone'; p.fade = 0.35; }
        }
      } else {
        p.moving = false;
      }

      if (p.state === 'gone') {
        p.fade -= dt;
        p.scale = Math.max(0, p.fade / 0.32);
        if (p.scale <= 0.002) { p.scale = 0; continue; }
      }

      const h = p.h * p.scale;
      const bob = p.moving ? Math.abs(Math.sin(p.phase)) * 0.025 : Math.sin(t * 1.3 + p.phase) * 0.005;
      const yb = this.pt + bob;
      q.setFromAxisAngle(CROWD_UP, p.rot);
      const legA = p.moving ? Math.sin(p.phase) * 0.45 : 0;
      const armA = p.moving ? -Math.sin(p.phase) * 0.36 : 0.04;

      // 躯干
      d.position.set(p.x, yb + 1.08 * h, p.z);
      d.quaternion.copy(q);
      d.scale.set(h, h, h);
      d.updateMatrix();
      this.body.setMatrixAt(i, d.matrix);

      // 头 / 头发
      d.position.set(p.x, yb + 1.57 * h, p.z);
      d.scale.set(h, h, h);
      d.updateMatrix();
      this.head.setMatrixAt(i, d.matrix);
      v.set(0, 0.012, -0.012).applyQuaternion(q);
      d.position.set(p.x + v.x * h, yb + 1.59 * h, p.z + v.z * h);
      d.updateMatrix();
      this.hair.setMatrixAt(i, d.matrix);

      // 腿
      for (let k = 0; k < 2; k++) {
        const side = k === 0 ? -1 : 1;
        v.set(side * 0.092, 0, 0).applyQuaternion(q);
        d.position.set(p.x + v.x * h, yb + 0.72 * h, p.z + v.z * h);
        q2.setFromAxisAngle(AXIS_X, side > 0 ? legA : -legA);
        d.quaternion.copy(q).multiply(q2);
        d.updateMatrix();
        (k === 0 ? this.legL : this.legR).setMatrixAt(i, d.matrix);
      }
      // 手臂
      for (let k = 0; k < 2; k++) {
        const side = k === 0 ? -1 : 1;
        v.set(side * 0.275, 0, 0).applyQuaternion(q);
        d.position.set(p.x + v.x * h, yb + 1.34 * h, p.z + v.z * h);
        q2.setFromAxisAngle(AXIS_X, side > 0 ? armA : -armA);
        d.quaternion.copy(q).multiply(q2);
        d.updateMatrix();
        (k === 0 ? this.armL : this.armR).setMatrixAt(i, d.matrix);
      }
    }

    [this.body, this.head, this.hair, this.legL, this.legR, this.armL, this.armR].forEach(m => {
      m.instanceMatrix.needsUpdate = true;
    });
  }

  startBoarding() {
    const rng = this.rng;
    for (const p of this.boardQueue) {
      if (p.state !== 'wait') continue;
      p.state = 'board';
      p.tx = -3.86;
      p.tz = this.nearestDoor(p.z);
      p.speed = 1.35 + rng() * 0.35;
    }
    this.boardQueue = [];
  }

  nearestDoor(z) {
    let best = this.doors[0], bd = 1e9;
    for (const d of this.doors) {
      const dd = Math.abs(d - z);
      if (dd < bd) { bd = dd; best = d; }
    }
    return best;
  }

  startExchange() {
    this.exchanged = true;
    const rng = this.rng;
    this.boardQueue = this.people.filter(p => p.state === 'wait')
      .sort((a, b) => Math.abs(this.nearestDoor(a.z) - a.z) - Math.abs(this.nearestDoor(b.z) - b.z))
      .slice(0, 13);
    this.boardDelay = 2.2;
    const spare = this.people.filter(p => p.state === 'spare');
    const nAlight = Math.min(11, spare.length);
    for (let k = 0; k < nAlight; k++) {
      const p = spare[k];
      const door = this.doors[Math.floor(rng() * this.doors.length)];
      p.state = 'alight';
      p.x = -3.92;
      p.z = door;
      p.scale = 1;
      p.rot = PI / 2;
      p.tx = -0.6 - rng() * 1.4;
      p.tz = door + (rng() - 0.5) * 10;
      p.speed = 1.35 + rng() * 0.45;
    }
  }
}
