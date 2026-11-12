package dev.example.sample;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.*;
import static java.util.stream.Collectors.toList;

public class Sample {
    private final Map<String, Element> elements = new HashMap<>();

    public void add(Element e) { elements.put(e.id(), e); }

    public List<String> ids() {
        return elements.values().stream().map(Element::id).sorted().collect(toList());
    }

    public static long countFiles(Path root) throws IOException {
        try (var s = Files.walk(root)) { return s.filter(Files::isRegularFile).count(); }
    }
}

interface Describable {
    String describe();
}

enum Level { CONTEXT, CONTAINER, COMPONENT }

record Element(String id, Level level) implements Describable {
    public String describe() { return level + ":" + id; }
}

@interface Marker {
    String value() default "";
}
