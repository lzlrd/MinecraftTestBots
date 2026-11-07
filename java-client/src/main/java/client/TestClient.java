package client;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.util.Arrays;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;
import org.cloudburstmc.math.vector.Vector3d;
import org.cloudburstmc.math.vector.Vector3i;
import org.geysermc.mcprotocollib.network.Session;
import org.geysermc.mcprotocollib.network.event.session.DisconnectedEvent;
import org.geysermc.mcprotocollib.network.event.session.SessionAdapter;
import org.geysermc.mcprotocollib.network.factory.ClientNetworkSessionFactory;
import org.geysermc.mcprotocollib.network.packet.Packet;
import org.geysermc.mcprotocollib.network.session.ClientNetworkSession;
import org.geysermc.mcprotocollib.protocol.MinecraftProtocol;
import org.geysermc.mcprotocollib.protocol.data.game.entity.object.Direction;
import org.geysermc.mcprotocollib.protocol.data.game.entity.player.Hand;
import org.geysermc.mcprotocollib.protocol.data.game.entity.player.PlayerAction;
import org.geysermc.mcprotocollib.protocol.data.game.entity.player.PositionElement;
import org.geysermc.mcprotocollib.protocol.data.game.ClientCommand;
import org.geysermc.mcprotocollib.protocol.packet.ingame.clientbound.ClientboundLoginPacket;
import org.geysermc.mcprotocollib.protocol.packet.ingame.clientbound.ClientboundRespawnPacket;
import org.geysermc.mcprotocollib.protocol.packet.ingame.clientbound.entity.ClientboundAddEntityPacket;
import org.geysermc.mcprotocollib.protocol.packet.ingame.clientbound.entity.player.ClientboundSetHealthPacket;
import org.geysermc.mcprotocollib.protocol.packet.ingame.serverbound.ServerboundClientCommandPacket;
import org.geysermc.mcprotocollib.protocol.packet.ingame.clientbound.entity.ClientboundRemoveEntitiesPacket;
import org.geysermc.mcprotocollib.protocol.packet.ingame.clientbound.entity.ClientboundSetPassengersPacket;
import org.geysermc.mcprotocollib.protocol.packet.ingame.clientbound.entity.player.ClientboundPlayerPositionPacket;
import org.geysermc.mcprotocollib.protocol.packet.ingame.serverbound.ServerboundPlayerLoadedPacket;
import org.geysermc.mcprotocollib.protocol.packet.ingame.serverbound.level.ServerboundAcceptTeleportationPacket;
import org.geysermc.mcprotocollib.protocol.packet.ingame.serverbound.player.ServerboundAttackPacket;
import org.geysermc.mcprotocollib.protocol.packet.ingame.serverbound.player.ServerboundInteractPacket;
import org.geysermc.mcprotocollib.protocol.packet.ingame.serverbound.player.ServerboundMovePlayerPosRotPacket;
import org.geysermc.mcprotocollib.protocol.packet.ingame.serverbound.player.ServerboundPlayerActionPacket;
import org.geysermc.mcprotocollib.protocol.packet.ingame.serverbound.player.ServerboundSetCarriedItemPacket;
import org.geysermc.mcprotocollib.protocol.packet.ingame.serverbound.player.ServerboundUseItemOnPacket;

/**
 * A scriptable 26.3 test client for offline-mode servers. Usage: testclient NAME PORT [HOST]. Reads commands on stdin
 * and prints events on stdout:
 * useon X Y Z FACE | dig X Y Z | attack ID | interact ID | slot N | move X Y Z | entities TYPE | vehicle | quit
 */
public final class TestClient {
	private static final Map<Integer, String> ENTITIES = new ConcurrentHashMap<>();
	private static final Map<Integer, double[]> POSITIONS = new ConcurrentHashMap<>();
	private static final AtomicInteger SEQUENCE = new AtomicInteger();
	private static volatile int self = -1;
	private static volatile int vehicle = -1;
	private static volatile double x, y, z;
	private static volatile float yaw, pitch;

	private static synchronized void out(String line) {
		System.out.println(line);
		System.out.flush();
	}

	public static void main(String[] args) throws Exception {
		ClientNetworkSession session = ClientNetworkSessionFactory.factory()
				.setAddress(args.length > 2 ? args[2] : "127.0.0.1", Integer.parseInt(args[1]))
				.setProtocol(new MinecraftProtocol(args[0]))
				.create();
		session.addListener(new SessionAdapter() {
			@Override
			public void packetReceived(Session session, Packet packet) {
				if (packet instanceof ClientboundLoginPacket login) {
					self = login.getEntityId();
					session.send(ServerboundPlayerLoadedPacket.INSTANCE);
					out("LOGIN " + self);
				} else if (packet instanceof ClientboundPlayerPositionPacket position) {
					Vector3d p = position.getPosition();
					boolean rx = position.getRelatives().contains(PositionElement.X);
					boolean ry = position.getRelatives().contains(PositionElement.Y);
					boolean rz = position.getRelatives().contains(PositionElement.Z);
					x = rx ? x + p.getX() : p.getX();
					y = ry ? y + p.getY() : p.getY();
					z = rz ? z + p.getZ() : p.getZ();
					yaw = position.getRelatives().contains(PositionElement.Y_ROT) ? yaw + position.getYRot() : position.getYRot();
					pitch = position.getRelatives().contains(PositionElement.X_ROT) ? pitch + position.getXRot() : position.getXRot();
					session.send(new ServerboundAcceptTeleportationPacket(position.getId(), x, y, z, yaw, pitch));
					// 26.3 takes the position from the accept itself; an extra move packet here gets the client kicked.
					out("TELEPORT " + x + " " + y + " " + z + " " + yaw + " " + pitch + " id=" + position.getId() + " rel=" + position.getRelatives());
				} else if (packet instanceof ClientboundSetHealthPacket health && health.getHealth() <= 0) {
					// Respawn straight away, like a player clicking Respawn on the death screen.
					session.send(new ServerboundClientCommandPacket(ClientCommand.PERFORM_RESPAWN));
					out("DIED");
				} else if (packet instanceof ClientboundRespawnPacket) {
					session.send(ServerboundPlayerLoadedPacket.INSTANCE);
					out("RESPAWNED");
				} else if (packet instanceof ClientboundAddEntityPacket add) {
					ENTITIES.put(add.getEntityId(), add.getType().toString().toLowerCase());
					POSITIONS.put(add.getEntityId(), new double[] {add.getX(), add.getY(), add.getZ()});
				} else if (packet instanceof ClientboundRemoveEntitiesPacket remove) {
					for (int id : remove.getEntityIds()) {
						ENTITIES.remove(id);
						POSITIONS.remove(id);
					}
				} else if (packet instanceof ClientboundSetPassengersPacket passengers) {
					boolean riding = Arrays.stream(passengers.getPassengerIds()).anyMatch(id -> id == self);
					if (riding)
						vehicle = passengers.getEntityId();
					else if (vehicle == passengers.getEntityId())
						vehicle = -1;
				}
			}

			@Override
			public void disconnected(DisconnectedEvent event) {
				out("DISCONNECTED " + event.getReason());
				System.exit(3);
			}
		});
		session.connect(true);

		BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
		for (String line; (line = in.readLine()) != null; ) {
			String[] a = line.trim().split("\\s+");
			switch (a[0]) {
				case "useon" -> {
					Vector3i pos = Vector3i.from(Integer.parseInt(a[1]), Integer.parseInt(a[2]), Integer.parseInt(a[3]));
					Direction face = Direction.valueOf(a[4]);
					session.send(new ServerboundUseItemOnPacket(pos, face, Hand.MAIN_HAND, 0.5f, face == Direction.UP ? 1f : 0.5f, 0.5f, false, false, SEQUENCE.incrementAndGet()));
					out("OK");
				}
				case "dig" -> {
					Vector3i pos = Vector3i.from(Integer.parseInt(a[1]), Integer.parseInt(a[2]), Integer.parseInt(a[3]));
					session.send(new ServerboundPlayerActionPacket(PlayerAction.START_DIGGING, pos, Direction.UP, SEQUENCE.incrementAndGet()));
					out("OK");
				}
				case "attack" -> {
					session.send(new ServerboundAttackPacket(Integer.parseInt(a[1])));
					out("OK");
				}
				case "interact" -> {
					session.send(new ServerboundInteractPacket(Integer.parseInt(a[1]), Hand.MAIN_HAND, Vector3d.from(0, 0.5, 0), false));
					out("OK");
				}
				case "slot" -> {
					session.send(new ServerboundSetCarriedItemPacket(Integer.parseInt(a[1])));
					out("OK");
				}
				case "move" -> {
					x = Double.parseDouble(a[1]);
					y = Double.parseDouble(a[2]);
					z = Double.parseDouble(a[3]);
					session.send(new ServerboundMovePlayerPosRotPacket(true, false, x, y, z, yaw, pitch));
					out("OK");
				}
				case "where" -> out("AT " + x + " " + y + " " + z);
				case "entities" -> {
					StringBuilder ids = new StringBuilder("ENTITIES");
					ENTITIES.forEach((id, type) -> {
						if (type.equals(a[1])) {
							double[] p = POSITIONS.get(id);
							ids.append(' ').append(id).append(':').append(p[0]).append(',').append(p[1]).append(',').append(p[2]);
						}
					});
					out(ids.toString());
				}
				case "vehicle" -> out("VEHICLE " + vehicle);
				case "quit" -> {
					session.disconnect("bye");
					System.exit(0);
				}
				default -> out("UNKNOWN " + line);
			}
		}
	}
}
