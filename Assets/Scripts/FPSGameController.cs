using UnityEngine;
using UnityEngine.UI;
using UnityEngine.AI;
using System.Collections;

namespace CSGame
{
    // ==========================================
    // 1. ЛОГИКА ПОЗИЦИОНИРОВАНИЯ ОРУЖИЯ И РУК (VIEWMODEL)
    // ==========================================
    public class FPSViewmodel : MonoBehaviour
    {
        [Header("Позиция из скриншота")]
        public Vector3 defaultPosition = new Vector3(0.18f, -0.18f, 0.38f); // Точные координаты с фото[span_2](start_span)[span_2](end_span)
        public Vector3 defaultRotation = new Vector3(0f, -4f, 0f);

        [Header("Покачивание (Sway)")]
        public float swayAmount = 0.02f;
        public float maxSwayAmount = 0.05f;
        public float swaySmoothness = 6f;

        private Vector3 initialLocalPos;

        void Start()
        {
            transform.localPosition = defaultPosition;
            transform.localRotation = Quaternion.Euler(defaultRotation);
            initialLocalPos = defaultPosition;
        }

        void Update()
        {
            float moveX = -Input.GetAxis("Mouse X") * swayAmount;
            float moveY = -Input.GetAxis("Mouse Y") * swayAmount;

            moveX = Mathf.Clamp(moveX, -maxSwayAmount, maxSwayAmount);
            moveY = Mathf.Clamp(moveY, -maxSwayAmount, maxSwayAmount);

            Vector3 targetPosition = new Vector3(moveX, moveY, 0f) + initialLocalPos;
            transform.localPosition = Vector3.Lerp(transform.localPosition, targetPosition, Time.deltaTime * swaySmoothness);
        }
    }

    // ==========================================
    // 2. ИСКУССТВЕННЫЙ ИНТЕЛЛЕКТ БОТОВ (CS BOT AI)
    // ==========================================
    [RequireComponent(typeof(NavMeshAgent))]
    public class CSBotAI : MonoBehaviour
    {
        [Header("Настройки ИИ")]
        public Transform playerTarget;
        public float visionAngle = 90f;
        public float visionRange = 25f;
        public float attackRange = 12f;
        public Transform[] waypoints;

        private NavMeshAgent agent;
        private int currentWaypointIndex;
        private float lastShootTime;
        public float fireRate = 0.15f;

        void Start()
        {
            agent = GetComponent<NavMeshAgent>();
            agent.speed = 3.5f;
            agent.stoppingDistance = 2f;
            GoToNextWaypoint();
        }

        void Update()
        {
            if (CanSeePlayer())
            {
                // Бот обходит стены и препятствия через NavMesh
                agent.SetDestination(playerTarget.position);

                Vector3 lookDirection = (playerTarget.position - transform.position).normalized;
                lookDirection.y = 0;
                if (lookDirection != Vector3.zero)
                {
                    transform.rotation = Quaternion.Slerp(transform.rotation, Quaternion.LookRotation(lookDirection), Time.deltaTime * 8f);
                }

                if (Vector3.Distance(transform.position, playerTarget.position) <= attackRange)
                {
                    Shoot();
                }
            }
            else
            {
                if (!agent.pathPending && agent.remainingDistance < 0.8f)
                {
                    GoToNextWaypoint();
                }
            }
        }

        bool CanSeePlayer()
        {
            if (playerTarget == null) return false;

            Vector3 dirToPlayer = (playerTarget.position - transform.position).normalized;
            float distanceToPlayer = Vector3.Distance(transform.position, playerTarget.position);

            if (distanceToPlayer < visionRange)
            {
                if (Vector3.Angle(transform.forward, dirToPlayer) < visionAngle / 2f)
                {
                    if (!Physics.Linecast(transform.position + Vector3.up * 1.5f, playerTarget.position + Vector3.up * 1.5f, out RaycastHit hit))
                    {
                        return true;
                    }
                    else if (hit.transform == playerTarget)
                    {
                        return true;
                    }
                }
            }
            return false;
        }

        void GoToNextWaypoint()
        {
            if (waypoints == null || waypoints.Length == 0) return;
            agent.destination = waypoints[currentWaypointIndex].position;
            currentWaypointIndex = (currentWaypointIndex + 1) % waypoints.Length;
        }

        void Shoot()
        {
            if (Time.time >= lastShootTime + fireRate)
            {
                lastShootTime = Time.time;
                Debug.Log(gameObject.name + " ведет огонь!");
            }
        }
    }

    // ==========================================
    // 3. ИНТЕРФЕЙС И КНОПКИ (HUD CONTROLLER)
    // ==========================================
    public class HUDController : MonoBehaviour
    {
        [Header("Элементы UI")]
        public Text healthText;
        public Text armorText;
        public Text ammoText;
        public Text fpsText;

        private float deltaTime = 0.0f;

        void Update()
        {
            // Расчет FPS (в левом верхнем углу)[span_3](start_span)[span_3](end_span)
            deltaTime += (Time.unscaledDeltaTime - deltaTime) * 0.1f;
            float fps = 1.0f / deltaTime;
            if (fpsText != null)
            {
                fpsText.text = Mathf.Ceil(fps).ToString() + " FPS";
            }
        }

        public void UpdatePlayerStats(int hp, int armor, int currentAmmo, int maxAmmo)
        {
            if (healthText != null) healthText.text = hp.ToString(); // Здоровье слева снизу[span_4](start_span)[span_4](end_span)
            if (armorText != null) armorText.text = armor.ToString(); // Броня[span_5](start_span)[span_5](end_span)
            if (ammoText != null) ammoText.text = currentAmmo.ToString() + " | " + maxAmmo.ToString(); // Патроны справа снизу[span_6](start_span)[span_6](end_span)
        }

        // Методы для мобильных кнопок (Стрельба, Присед, Прыжок, Магазин)[span_7](start_span)[span_7](end_span)
        public void OnShootButtonPressed() { Debug.Log("Выстрел"); }
        public void OnCrouchButtonPressed() { Debug.Log("Присед"); }
        public void OnJumpButtonPressed() { Debug.Log("Прыжок"); }
        public void OnShopButtonPressed() { Debug.Log("Открыт магазин"); }
    }
}
