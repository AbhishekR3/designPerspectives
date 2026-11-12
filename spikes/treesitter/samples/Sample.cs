using System;
using System.Collections.Generic;
using System.Linq;
using IO = System.IO;
using static System.Math;

namespace Example.Sample
{
    public enum Level { Context, Container, Component }

    public interface IDescribable
    {
        string Describe();
    }

    public record Element(string Id, Level Level) : IDescribable
    {
        public string Describe() => $"{Level}:{Id}";
    }

    public struct Point { public int X; public int Y; }

    public class Workspace
    {
        private readonly Dictionary<string, Element> _elements = new();

        public void Add(Element e) => _elements[e.Id] = e;

        public IEnumerable<string> Ids() => _elements.Values.Select(e => e.Id).OrderBy(x => x);

        public static int CountFiles(string root) =>
            Max(0, IO.Directory.EnumerateFiles(root, "*", IO.SearchOption.AllDirectories).Count());
    }

    public delegate void Changed(object sender, EventArgs args);
}
